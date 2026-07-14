import type { Editor } from 'grapesjs'

/**
 * Registers a `var-<name>` block per variable name in the GrapesJS palette.
 * Block content uses the same `<mj-text><span class="email-token">{{name}}</span></mj-text>`
 * pattern as the POC v2 reference. The font-awesome icon class is omitted
 * (the project doesn't bundle Font Awesome — F45 fix from POC v2).
 *
 * Variables must already be sanitized to alphanumeric + underscore by the
 * caller (the API contract restricts template_key + variable names to that
 * shape; arbitrary user input is never passed here).
 */
export function registerVariableBlocks(editor: Editor, variables: readonly string[]): void {
  variables.forEach((name) => {
    editor.BlockManager.add(`var-${name}`, {
      label: `{{${name}}}`,
      category: 'Variables',
      content: `<mj-text padding="4px 0"><span class="email-token">{{${name}}}</span></mj-text>`,
    })
  })
}
