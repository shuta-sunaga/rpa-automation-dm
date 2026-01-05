// 画像認識エンジン - テンプレートマッチング
import Jimp from 'jimp';
import { execSync } from 'child_process';
import { Point, Region, MatchResult } from './types';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';

export class ImageRecognizer {
  private screenshotDir: string;
  private templateDir: string;
  private scriptPath: string;

  constructor(baseDir: string = process.cwd()) {
    this.screenshotDir = join(baseDir, 'screenshots');
    this.templateDir = join(baseDir, 'templates');
    this.scriptPath = join(baseDir, 'scripts', 'capture-screen.ps1');

    console.log(`[ImageRecognizer] Initialized with baseDir: ${baseDir}`);
    console.log(`[ImageRecognizer] Template dir: ${this.templateDir}`);
    console.log(`[ImageRecognizer] Script path: ${this.scriptPath}`);

    // ディレクトリ作成
    if (!existsSync(this.screenshotDir)) {
      mkdirSync(this.screenshotDir, { recursive: true });
    }
    if (!existsSync(this.templateDir)) {
      mkdirSync(this.templateDir, { recursive: true });
    }
  }

  /**
   * 画面をキャプチャしてBufferで返す (外部PowerShellスクリプト使用)
   */
  async captureScreen(): Promise<Buffer> {
    const tempFile = join(tmpdir(), `screenshot-${Date.now()}.png`);

    try {
      // 外部スクリプトファイルを使用（インラインPowerShellの型解決問題を回避）
      const command = `powershell -ExecutionPolicy Bypass -File "${this.scriptPath}" -OutputPath "${tempFile}"`;
      execSync(command, { encoding: 'utf8', timeout: 15000 });

      if (!existsSync(tempFile)) {
        throw new Error('Screenshot file was not created');
      }

      const buffer = readFileSync(tempFile);
      try {
        unlinkSync(tempFile);
      } catch {
        // クリーンアップエラーは無視
      }
      return buffer;
    } catch (error: any) {
      console.error('[ImageRecognizer] Screen capture error:', error.message);
      throw error;
    }
  }

  /**
   * 画面をキャプチャしてファイルに保存
   */
  async captureScreenToFile(filename: string): Promise<string> {
    const buffer = await this.captureScreen();
    const filepath = join(this.screenshotDir, `${filename}-${Date.now()}.png`);
    writeFileSync(filepath, buffer);
    return filepath;
  }

  /**
   * テンプレート画像を画面から検索
   * @param templatePath テンプレート画像のパス
   * @param confidence 信頼度閾値 (0.0-1.0)
   * @param searchRegion 検索範囲（省略時は画面全体）
   */
  async findImage(
    templatePath: string,
    confidence: number = 0.9,
    searchRegion?: Region
  ): Promise<MatchResult> {
    try {
      // 画面キャプチャ
      const screenBuffer = await this.captureScreen();
      const screenImage = await Jimp.read(screenBuffer);

      // テンプレート画像読み込み
      const fullTemplatePath = templatePath.startsWith(this.templateDir)
        ? templatePath
        : join(this.templateDir, templatePath);

      console.log(`[ImageRecognizer] Looking for template: ${fullTemplatePath}`);
      console.log(`[ImageRecognizer] Template dir: ${this.templateDir}`);
      console.log(`[ImageRecognizer] Template exists: ${existsSync(fullTemplatePath)}`);

      if (!existsSync(fullTemplatePath)) {
        console.log(`[ImageRecognizer] Template not found!`);
        return {
          found: false,
          confidence: 0,
          location: { x: 0, y: 0 },
          region: { x: 0, y: 0, width: 0, height: 0 }
        };
      }

      const templateImage = await Jimp.read(fullTemplatePath);

      // 検索範囲の設定
      const searchX = searchRegion?.x ?? 0;
      const searchY = searchRegion?.y ?? 0;
      const searchWidth = searchRegion?.width ?? screenImage.getWidth() - templateImage.getWidth();
      const searchHeight = searchRegion?.height ?? screenImage.getHeight() - templateImage.getHeight();

      console.log(`[ImageRecognizer] Screen size: ${screenImage.getWidth()}x${screenImage.getHeight()}`);
      console.log(`[ImageRecognizer] Template size: ${templateImage.getWidth()}x${templateImage.getHeight()}`);
      console.log(`[ImageRecognizer] Search area: x=${searchX}, y=${searchY}, w=${searchWidth}, h=${searchHeight}`);

      // テンプレートマッチング
      const result = await this.templateMatch(
        screenImage,
        templateImage,
        searchX,
        searchY,
        searchWidth,
        searchHeight
      );

      console.log(`[ImageRecognizer] Match result: confidence=${result.confidence.toFixed(3)}, x=${result.x}, y=${result.y}`);
      console.log(`[ImageRecognizer] Required confidence: ${confidence}`);

      if (result.confidence >= confidence) {
        console.log(`[ImageRecognizer] ✓ Image FOUND!`);
        return {
          found: true,
          confidence: result.confidence,
          location: {
            x: result.x + Math.floor(templateImage.getWidth() / 2),
            y: result.y + Math.floor(templateImage.getHeight() / 2)
          },
          region: {
            x: result.x,
            y: result.y,
            width: templateImage.getWidth(),
            height: templateImage.getHeight()
          }
        };
      }

      console.log(`[ImageRecognizer] ✗ Image NOT found (confidence ${result.confidence.toFixed(3)} < ${confidence})`);
      return {
        found: false,
        confidence: result.confidence,
        location: { x: 0, y: 0 },
        region: { x: 0, y: 0, width: 0, height: 0 }
      };
    } catch (error) {
      console.error('Image recognition error:', error);
      return {
        found: false,
        confidence: 0,
        location: { x: 0, y: 0 },
        region: { x: 0, y: 0, width: 0, height: 0 }
      };
    }
  }

  /**
   * テンプレートマッチングの実装
   * 正規化相互相関(NCC)を使用
   */
  private async templateMatch(
    screen: Jimp,
    template: Jimp,
    searchX: number,
    searchY: number,
    searchWidth: number,
    searchHeight: number
  ): Promise<{ x: number; y: number; confidence: number }> {
    const templateWidth = template.getWidth();
    const templateHeight = template.getHeight();

    let bestMatch = { x: 0, y: 0, confidence: 0 };
    const step = 2; // 高速化のためステップを設定

    // グレースケール変換してマッチング
    const screenGray = screen.clone().grayscale();
    const templateGray = template.clone().grayscale();

    for (let y = searchY; y < searchY + searchHeight; y += step) {
      for (let x = searchX; x < searchX + searchWidth; x += step) {
        const score = this.calculateNCC(
          screenGray,
          templateGray,
          x,
          y,
          templateWidth,
          templateHeight
        );

        if (score > bestMatch.confidence) {
          bestMatch = { x, y, confidence: score };

          // 高信頼度なら早期終了
          if (score > 0.98) {
            return bestMatch;
          }
        }
      }
    }

    // 精密検索（ベストマッチ周辺を1ピクセル単位で）
    if (bestMatch.confidence > 0.7 && step > 1) {
      const fineSearchRange = step * 2;
      for (let y = Math.max(0, bestMatch.y - fineSearchRange); y <= bestMatch.y + fineSearchRange; y++) {
        for (let x = Math.max(0, bestMatch.x - fineSearchRange); x <= bestMatch.x + fineSearchRange; x++) {
          const score = this.calculateNCC(
            screenGray,
            templateGray,
            x,
            y,
            templateWidth,
            templateHeight
          );

          if (score > bestMatch.confidence) {
            bestMatch = { x, y, confidence: score };
          }
        }
      }
    }

    return bestMatch;
  }

  /**
   * 正規化相互相関(NCC)計算
   */
  private calculateNCC(
    screen: Jimp,
    template: Jimp,
    offsetX: number,
    offsetY: number,
    width: number,
    height: number
  ): number {
    let sumST = 0;
    let sumS2 = 0;
    let sumT2 = 0;
    let sumS = 0;
    let sumT = 0;
    let count = 0;

    const sampleStep = 2; // サンプリングステップ

    for (let y = 0; y < height; y += sampleStep) {
      for (let x = 0; x < width; x += sampleStep) {
        const screenX = offsetX + x;
        const screenY = offsetY + y;

        if (screenX >= screen.getWidth() || screenY >= screen.getHeight()) {
          continue;
        }

        const screenPixel = Jimp.intToRGBA(screen.getPixelColor(screenX, screenY));
        const templatePixel = Jimp.intToRGBA(template.getPixelColor(x, y));

        const s = screenPixel.r;
        const t = templatePixel.r;

        sumST += s * t;
        sumS2 += s * s;
        sumT2 += t * t;
        sumS += s;
        sumT += t;
        count++;
      }
    }

    if (count === 0) return 0;

    // NCC計算
    const meanS = sumS / count;
    const meanT = sumT / count;
    const numerator = sumST - count * meanS * meanT;
    const denominator = Math.sqrt(
      (sumS2 - count * meanS * meanS) * (sumT2 - count * meanT * meanT)
    );

    if (denominator === 0) return 0;
    return Math.max(0, numerator / denominator);
  }

  /**
   * 画像が表示されるまで待機
   */
  async waitForImage(
    templatePath: string,
    timeout: number = 30000,
    confidence: number = 0.9,
    pollInterval: number = 500
  ): Promise<MatchResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const result = await this.findImage(templatePath, confidence);
      if (result.found) {
        return result;
      }
      await this.sleep(pollInterval);
    }

    return {
      found: false,
      confidence: 0,
      location: { x: 0, y: 0 },
      region: { x: 0, y: 0, width: 0, height: 0 }
    };
  }

  /**
   * 画像が消えるまで待機
   */
  async waitUntilImageGone(
    templatePath: string,
    timeout: number = 30000,
    confidence: number = 0.9,
    pollInterval: number = 500
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const result = await this.findImage(templatePath, confidence);
      if (!result.found) {
        return true;
      }
      await this.sleep(pollInterval);
    }

    return false;
  }

  /**
   * テンプレート画像を保存
   */
  async saveTemplate(name: string, region?: Region): Promise<string> {
    const screenBuffer = await this.captureScreen();
    const screenImage = await Jimp.read(screenBuffer);

    let templateImage: Jimp;
    if (region) {
      templateImage = screenImage.crop(region.x, region.y, region.width, region.height);
    } else {
      templateImage = screenImage;
    }

    const filepath = join(this.templateDir, `${name}.png`);
    await templateImage.writeAsync(filepath);
    return filepath;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
