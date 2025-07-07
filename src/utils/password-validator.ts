import zxcvbn from 'zxcvbn';
import crypto from 'crypto';
import { 
  PASSWORD_RULES, 
  PASSWORD_SECURITY_CONFIG, 
  COMMON_PASSWORD_PATTERNS,
  BASIC_WEAK_PASSWORDS,
  VALIDATION_MESSAGES 
} from '../constants/validation-rules';

/**
 * 密码验证结果接口
 */
export interface PasswordValidationResult {
  isValid: boolean;
  score: number; // 0-4
  errors: string[];
  suggestions: string[];
  estimatedCrackTime: string;
  isCompromised?: boolean;
}

/**
 * 密码验证器类
 */
export class PasswordValidator {
  
  /**
   * 全面的密码验证
   */
  static async validatePassword(
    password: string, 
    userInputs: string[] = []
  ): Promise<PasswordValidationResult> {
    const result: PasswordValidationResult = {
      isValid: true,
      score: 0,
      errors: [],
      suggestions: [],
      estimatedCrackTime: '',
      isCompromised: false
    };

    // 1. 基础规则检查
    this.validateBasicRules(password, result);

    // 2. 使用 zxcvbn 进行强度检测
    if (PASSWORD_SECURITY_CONFIG.USE_ZXCVBN) {
      this.validateWithZxcvbn(password, userInputs, result);
    }

    // 3. 检查常见模式
    if (PASSWORD_SECURITY_CONFIG.BLOCK_COMMON_PATTERNS) {
      this.validateCommonPatterns(password, result);
    }

    // 4. 检查是否在数据泄露中（异步）
    if (PASSWORD_SECURITY_CONFIG.USE_HIBP_API) {
      try {
        result.isCompromised = await this.checkHaveIBeenPwned(password);
        if (result.isCompromised) {
          result.isValid = false;
          result.errors.push(VALIDATION_MESSAGES.PASSWORD_COMPROMISED);
        }
      } catch (error) {
        // HIBP API 失败时不影响整体验证，只记录日志
        console.warn('HIBP API check failed:', error);
      }
    }

    // 5. 检查个人信息
    if (PASSWORD_SECURITY_CONFIG.BLOCK_PERSONAL_INFO) {
      this.validatePersonalInfo(password, userInputs, result);
    }

    return result;
  }

  /**
   * 基础规则验证
   */
  private static validateBasicRules(password: string, result: PasswordValidationResult): void {
    if (!password) {
      result.isValid = false;
      result.errors.push(VALIDATION_MESSAGES.PASSWORD_REQUIRED);
      return;
    }

    if (password.length < PASSWORD_RULES.MIN_LENGTH) {
      result.isValid = false;
      result.errors.push(VALIDATION_MESSAGES.PASSWORD_TOO_SHORT);
    }

    if (password.length > PASSWORD_RULES.MAX_LENGTH) {
      result.isValid = false;
      result.errors.push(VALIDATION_MESSAGES.PASSWORD_TOO_LONG);
    }

    // 检查基础弱密码列表
    if ((BASIC_WEAK_PASSWORDS as readonly string[]).includes(password.toLowerCase())) {
      result.isValid = false;
      result.errors.push(VALIDATION_MESSAGES.PASSWORD_COMMON);
    }

    // 字符类型检查
    if (PASSWORD_RULES.REQUIRE_LOWERCASE && !/[a-z]/.test(password)) {
      result.isValid = false;
      result.errors.push('Password must contain lowercase letters');
    }

    if (PASSWORD_RULES.REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) {
      result.isValid = false;
      result.errors.push('Password must contain uppercase letters');
    }

    if (PASSWORD_RULES.REQUIRE_NUMBERS && !/\d/.test(password)) {
      result.isValid = false;
      result.errors.push('Password must contain numbers');
    }

    if (PASSWORD_RULES.REQUIRE_SYMBOLS && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      result.isValid = false;
      result.errors.push('Password must contain special characters');
    }
  }

  /**
   * 使用 zxcvbn 进行强度检测
   */
  private static validateWithZxcvbn(
    password: string, 
    userInputs: string[], 
    result: PasswordValidationResult
  ): void {
    const zxcvbnResult = zxcvbn(password, userInputs);
    
    result.score = zxcvbnResult.score;
    result.estimatedCrackTime = String(zxcvbnResult.crack_times_display.offline_slow_hashing_1e4_per_second);

    if (zxcvbnResult.score < PASSWORD_SECURITY_CONFIG.ZXCVBN_MIN_SCORE) {
      result.isValid = false;
      result.errors.push(VALIDATION_MESSAGES.PASSWORD_TOO_WEAK);
    }

    // 添加 zxcvbn 的建议
    if (zxcvbnResult.feedback.suggestions.length > 0) {
      result.suggestions.push(...zxcvbnResult.feedback.suggestions);
    }

    if (zxcvbnResult.feedback.warning) {
      result.suggestions.push(zxcvbnResult.feedback.warning);
    }
  }

  /**
   * 检查常见密码模式
   */
  private static validateCommonPatterns(password: string, result: PasswordValidationResult): void {
    // 检查数字序列
    for (const pattern of COMMON_PASSWORD_PATTERNS.NUMERIC_SEQUENCES) {
      if (pattern.test(password)) {
        result.isValid = false;
        result.errors.push(VALIDATION_MESSAGES.PASSWORD_SEQUENTIAL);
        break;
      }
    }

    // 检查字母序列
    for (const pattern of COMMON_PASSWORD_PATTERNS.ALPHABETIC_SEQUENCES) {
      if (pattern.test(password)) {
        result.isValid = false;
        result.errors.push(VALIDATION_MESSAGES.PASSWORD_SEQUENTIAL);
        break;
      }
    }

    // 检查键盘模式
    for (const pattern of COMMON_PASSWORD_PATTERNS.KEYBOARD_PATTERNS) {
      if (pattern.test(password)) {
        result.isValid = false;
        result.errors.push(VALIDATION_MESSAGES.PASSWORD_KEYBOARD_PATTERN);
        break;
      }
    }

    // 检查重复字符
    for (const pattern of COMMON_PASSWORD_PATTERNS.REPEATED_CHARS) {
      if (pattern.test(password)) {
        result.isValid = false;
        result.errors.push('Password should not contain repeated characters');
        break;
      }
    }
  }

  /**
   * 检查密码是否包含个人信息
   */
  private static validatePersonalInfo(
    password: string, 
    userInputs: string[], 
    result: PasswordValidationResult
  ): void {
    const lowercasePassword = password.toLowerCase();
    
    for (const input of userInputs) {
      if (input && input.length > 2 && lowercasePassword.includes(input.toLowerCase())) {
        result.isValid = false;
        result.errors.push(VALIDATION_MESSAGES.PASSWORD_CONTAINS_PERSONAL_INFO);
        break;
      }
    }
  }

  /**
   * 检查密码是否在 HaveIBeenPwned 数据库中
   */
  private static async checkHaveIBeenPwned(password: string): Promise<boolean> {
    try {
      // 对密码进行 SHA-1 哈希
      const sha1Hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
      const prefix = sha1Hash.substring(0, 5);
      const suffix = sha1Hash.substring(5);

      // 调用 HIBP API
      const response = await fetch(
        `${PASSWORD_SECURITY_CONFIG.HIBP_API_URL}${prefix}`,
        {
          method: 'GET',
          headers: {
            'User-Agent': 'Beauty-Auth-Service'
          },
          signal: AbortSignal.timeout(PASSWORD_SECURITY_CONFIG.HIBP_TIMEOUT_MS)
        }
      );

      if (!response.ok) {
        throw new Error(`HIBP API returned ${response.status}`);
      }

      const data = await response.text();
      
      // 检查响应中是否包含我们的密码哈希后缀
      return data.split('\n').some(line => {
        const [hashSuffix] = line.split(':');
        return hashSuffix === suffix;
      });

    } catch (error) {
      console.error('Error checking HaveIBeenPwned:', error);
      // 如果 API 调用失败，返回 false（不阻止用户使用密码）
      return false;
    }
  }

  /**
   * 快速密码强度检查（不包含异步操作）
   */
  static validatePasswordSync(password: string, userInputs: string[] = []): Omit<PasswordValidationResult, 'isCompromised'> {
    const result: Omit<PasswordValidationResult, 'isCompromised'> = {
      isValid: true,
      score: 0,
      errors: [],
      suggestions: [],
      estimatedCrackTime: ''
    };

    // 基础规则检查
    this.validateBasicRules(password, result as PasswordValidationResult);

    // zxcvbn 检查
    if (PASSWORD_SECURITY_CONFIG.USE_ZXCVBN) {
      this.validateWithZxcvbn(password, userInputs, result as PasswordValidationResult);
    }

    // 常见模式检查
    if (PASSWORD_SECURITY_CONFIG.BLOCK_COMMON_PATTERNS) {
      this.validateCommonPatterns(password, result as PasswordValidationResult);
    }

    // 个人信息检查
    if (PASSWORD_SECURITY_CONFIG.BLOCK_PERSONAL_INFO) {
      this.validatePersonalInfo(password, userInputs, result as PasswordValidationResult);
    }

    return result;
  }
} 