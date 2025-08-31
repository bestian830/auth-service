interface TemplateArgs {
  brand: string;
  email: string;
  selector: string;
  token: string;
  minutes: number;
}

interface Template {
  subject: string;
  html: string;
}

export const Templates = {
  signupCode: (args: TemplateArgs): Template => ({
    subject: `${args.brand}｜邮箱验证`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>邮箱验证</h2>
        <p>您好，</p>
        <p>感谢您注册 ${args.brand}！请使用以下验证码完成邮箱验证：</p>
        <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; text-align: center; font-size: 18px; font-weight: bold;">
          ${args.selector}.${args.token}
        </div>
        <p>此验证码将在 ${args.minutes} 分钟内有效。</p>
        <p>如果您没有注册 ${args.brand} 账户，请忽略此邮件。</p>
        <hr>
        <p style="color: #666; font-size: 12px;">此邮件由系统自动发送，请勿回复。</p>
      </div>
    `
  }),

  resetCode: (args: TemplateArgs): Template => ({
    subject: `${args.brand}｜重置密码`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>重置密码</h2>
        <p>您好，</p>
        <p>我们收到了您的密码重置请求。请使用以下重置码设置新密码：</p>
        <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; text-align: center; font-size: 18px; font-weight: bold;">
          ${args.selector}.${args.token}
        </div>
        <p>此重置码将在 ${args.minutes} 分钟内有效。</p>
        <p>如果您没有请求重置密码，请忽略此邮件或联系我们的客服团队。</p>
        <hr>
        <p style="color: #666; font-size: 12px;">此邮件由系统自动发送，请勿回复。</p>
      </div>
    `
  }),

  changeEmail: (args: TemplateArgs): Template => ({
    subject: `${args.brand}｜确认邮箱变更`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>确认邮箱变更</h2>
        <p>您好，</p>
        <p>我们收到了您的邮箱变更请求。请使用以下验证码确认新邮箱：</p>
        <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; text-align: center; font-size: 18px; font-weight: bold;">
          ${args.selector}.${args.token}
        </div>
        <p>此验证码将在 ${args.minutes} 分钟内有效。</p>
        <p>如果您没有请求变更邮箱，请立即联系我们的客服团队。</p>
        <hr>
        <p style="color: #666; font-size: 12px;">此邮件由系统自动发送，请勿回复。</p>
      </div>
    `
  })
};