// Ambient type shims for ESM-only / untyped packages used from the CommonJS server.

declare module 'file-type' {
  export interface FileTypeResult {
    mime: string
    ext: string
  }
  export function fileTypeFromBuffer(buffer: Uint8Array): Promise<FileTypeResult | undefined>
}

declare module 'mjml' {
  interface MjmlError {
    line: number
    message: string
    tagName?: string
    formattedMessage?: string
  }
  interface MjmlOptions {
    validationLevel?: 'strict' | 'soft' | 'skip'
    keepComments?: boolean
    minify?: boolean
  }
  interface MjmlResult {
    html: string
    errors?: MjmlError[]
  }
  // mjml v5+ is async — returns a Promise even though the v4 README still
  // shows a sync API.
  function mjml2html(input: string, options?: MjmlOptions): Promise<MjmlResult>
  export default mjml2html
}

declare module 'mjml-parser-xml' {
  interface MJMLParserOptions {
    addEmptyAttributes?: boolean
    components?: Record<string, unknown>
    convertBooleans?: boolean
    keepComments?: boolean
    filePath?: string
    actualPath?: string
    ignoreIncludes?: boolean
    cwd?: string
  }
  interface MJMLNode {
    tagName: string
    attributes?: Record<string, string>
    children?: MJMLNode[]
    content?: string
    file?: string
    absoluteFilePath?: string
    line?: number
    includedIn?: unknown[]
  }
  function MJMLParser(input: string, options?: MJMLParserOptions): MJMLNode
  export = MJMLParser
}
