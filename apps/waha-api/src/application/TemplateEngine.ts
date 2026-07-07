import { logger } from "../infrastructure/logger.js";

export class TemplateEngine {
  /**
   * Compiles template string by replacing {{variable_name}} with mapping value
   */
  compile(template: string, variables: Record<string, string>): string {
    let compiled = template;
    // Match all double bracket variables: {{varName}}
    const regex = /\{\{([^}]+)\}\}/g;
    let match;
    
    while ((match = regex.exec(template)) !== null) {
      const fullPlaceholder = match[0]; // e.g. {{name}}
      const varName = match[1].trim(); // e.g. name
      
      // If the variable is present in the object, replace it
      if (variables[varName] !== undefined) {
        compiled = compiled.replace(new RegExp(this.escapeRegExp(fullPlaceholder), "g"), variables[varName]);
      }
    }
    
    return compiled;
  }

  /**
   * Validates if all placeholders inside the template are present in the CSV headers.
   * Returns list of undefined/unknown variables.
   */
  validate(template: string, csvHeaders: string[]): string[] {
    const regex = /\{\{([^}]+)\}\}/g;
    const unknownVariables: string[] = [];
    let match;

    const lowerHeaders = csvHeaders.map(h => h.trim().toLowerCase());

    while ((match = regex.exec(template)) !== null) {
      const varName = match[1].trim();
      const varNameLower = varName.toLowerCase();
      
      if (!lowerHeaders.includes(varNameLower)) {
        unknownVariables.push(varName);
      }
    }

    return unknownVariables;
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
