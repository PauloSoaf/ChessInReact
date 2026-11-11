import { BetzaParser } from '../../engine/rules/behaviors/BetzaParser';
import { IValidationResult } from '../interfaces/IModdingContracts';

export class BetzaValidatorSandbox {
  public static readonly MAX_STRING_LENGTH = 100;
  public static readonly MAX_CPU_BUDGET_MS = 2.0;

  // Allowed standard characters in Betza notation and modifiers
  private static readonly SAFE_BETZA_PATTERN = /^[A-Za-z0-9_+\s-]+$/;

  /**
   * Validates a candidate Betza notation string against security constraints (Spec 10 § 3.1, § 6, RF-02).
   */
  public static validate(candidate: string): IValidationResult {
    const startTime = performance.now();
    const errors: string[] = [];

    if (!candidate || typeof candidate !== 'string') {
      return {
        isValid: false,
        errors: ['Notação Betza não pode ser vazia ou nula.'],
        executionTimeMs: performance.now() - startTime,
      };
    }

    const trimmed = candidate.trim();

    // 1. Length constraint
    if (trimmed.length === 0) {
      errors.push('Notação Betza não pode ser vazia.');
    } else if (trimmed.length > this.MAX_STRING_LENGTH) {
      errors.push(
        `Notação Betza excede o limite máximo permitido de ${this.MAX_STRING_LENGTH} caracteres (recebido: ${trimmed.length}).`
      );
    }

    // 2. Lexical security check against injection / ReDoS
    if (!this.SAFE_BETZA_PATTERN.test(trimmed)) {
      errors.push('Notação Betza contém caracteres ilegais ou potencialmente maliciosos.');
    }

    // 3. Execution parser test in strict sandbox
    if (errors.length === 0) {
      try {
        const behaviors = BetzaParser.parse(trimmed);
        if (behaviors.length === 0) {
          errors.push(`Notação Betza '${trimmed}' não pôde ser resolvida para nenhum comportamento válido.`);
        }
      } catch (err) {
        errors.push(`Erro de compilação da regra Betza: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const executionTimeMs = performance.now() - startTime;

    // 4. CPU Budget threshold (< 2.0 ms)
    if (executionTimeMs > this.MAX_CPU_BUDGET_MS) {
      errors.push(
        `Tempo de resolução da regra (${executionTimeMs.toFixed(2)}ms) excedeu o limite máximo seguro de ${this.MAX_CPU_BUDGET_MS}ms.`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      executionTimeMs,
    };
  }
}

