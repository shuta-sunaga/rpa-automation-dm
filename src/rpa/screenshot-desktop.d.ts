declare module 'screenshot-desktop' {
  interface Options {
    format?: 'png' | 'jpg';
    screen?: number;
  }

  function screenshot(options?: Options): Promise<Buffer>;
  export = screenshot;
}
