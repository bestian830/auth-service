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
    subject: `${args.brand} | Email Verification`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Email Verification</h2>
        <p>Hello,</p>
        <p>Thank you for signing up for ${args.brand}! Please use the following verification code to complete your email verification:</p>
        <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; text-align: center; font-size: 18px; font-weight: bold;">
          ${args.token}
        </div>
        <p>This verification code will expire in ${args.minutes} minutes.</p>
        <p>If you did not sign up for a ${args.brand} account, please ignore this email.</p>
        <hr>
        <p style="color: #666; font-size: 12px;">This email was sent automatically by the system. Please do not reply.</p>
      </div>
    `
  }),

  resetCode: (args: TemplateArgs): Template => ({
    subject: `${args.brand} | Password Reset`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset</h2>
        <p>Hello,</p>
        <p>We received your password reset request. Please use the following reset code to set a new password:</p>
        <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; text-align: center; font-size: 18px; font-weight: bold;">
          ${args.token}
        </div>
        <p>This reset code will expire in ${args.minutes} minutes.</p>
        <p>If you did not request a password reset, please ignore this email or contact our customer service team.</p>
        <hr>
        <p style="color: #666; font-size: 12px;">This email was sent automatically by the system. Please do not reply.</p>
      </div>
    `
  }),

  changeEmail: (args: TemplateArgs): Template => ({
    subject: `${args.brand} | Confirm Email Change`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Confirm Email Change</h2>
        <p>Hello,</p>
        <p>We received your email change request. Please use the following verification code to confirm your new email:</p>
        <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; text-align: center; font-size: 18px; font-weight: bold;">
          ${args.token}
        </div>
        <p>This verification code will expire in ${args.minutes} minutes.</p>
        <p>If you did not request an email change, please contact our customer service team immediately.</p>
        <hr>
        <p style="color: #666; font-size: 12px;">This email was sent automatically by the system. Please do not reply.</p>
      </div>
    `
  })
};