import { FunctionDeclaration, Tool } from '@google/genai';
import { toolRegistry } from '../../tools/tool-registry.js';

export function getAgentToolConfig(): Tool[] {
  const declarations: FunctionDeclaration[] = toolRegistry.getFunctionDeclarations();
  return [
    {
      functionDeclarations: declarations,
    },
  ];
}

export { toolRegistry };
