export interface MessageVariables {
  username?: string;
  displayName?: string;
  keyword?: string;
}

export class MessageTemplate {
  private template: string;

  constructor(template: string) {
    this.template = template;
  }

  /**
   * テンプレート内の変数を置換してメッセージを生成
   * 使用可能な変数: {{username}}, {{displayName}}, {{keyword}}
   */
  render(variables: MessageVariables = {}): string {
    let message = this.template;

    if (variables.username) {
      message = message.replace(/\{\{username\}\}/g, variables.username);
    }

    if (variables.displayName) {
      message = message.replace(/\{\{displayName\}\}/g, variables.displayName);
    }

    if (variables.keyword) {
      message = message.replace(/\{\{keyword\}\}/g, variables.keyword);
    }

    return message;
  }

  getTemplate(): string {
    return this.template;
  }
}

// サンプルテンプレート集
export const SAMPLE_TEMPLATES = {
  // シンプルな挨拶
  simple: `はじめまして！
DMさせていただきました。
よろしければお話しできると嬉しいです！`,

  // キーワードに言及
  withKeyword: `はじめまして！
「{{keyword}}」に興味をお持ちとのことで、
ぜひお話しできればと思いDMさせていただきました。
お時間ある時にお返事いただけると嬉しいです！`,

  // ユーザー名に言及
  personalized: `{{displayName}}さん、はじめまして！
プロフィールを拝見してDMさせていただきました。
共通の話題でお話しできると嬉しいです！`,
};
