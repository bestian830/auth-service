import { env } from '../config/env.js';
import nodemailer from 'nodemailer';
import { audit } from '../middleware/audit.js';

export interface Mailer {
  send(to: string, subject: string, html: string): Promise<void>;
  verifyConnection(): Promise<boolean>;
}

export function getMailer(): Mailer {
  if (env.mailTransport === 'SMTP') {
    return new SmtpMailer();
  }
  return new ConsoleMailer();
}

class ConsoleMailer implements Mailer {
  async send(to: string, subject: string, html: string): Promise<void> {
    console.log(`[DEV MAIL] to=${to} subject="${subject}" from=${env.mailFrom}`);
    console.log('=== EMAIL CONTENT START ===');
    console.log(html);
    console.log('=== EMAIL CONTENT END ===');
    
    audit('email_sent', {
      transport: 'console',
      to,
      subject,
      from: env.mailFrom,
      contentLength: html.length
    });
  }

  async verifyConnection(): Promise<boolean> {
    return true; // Console mailer is always "connected"
  }
}

class SmtpMailer implements Mailer {
  private transporter: nodemailer.Transporter | null = null;
  private connectionVerified = false;

  private createTransporter() {
    if (this.transporter) {
      return this.transporter;
    }

    // Create transporter with enhanced configuration
    this.transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure, // true for 465, false for other ports
      auth: {
        user: env.smtpAuthUser || env.smtpUser,
        pass: env.smtpAuthPass || env.smtpPass,
      },
      // Additional production-ready options
      pool: true, // Use pooled connections
      maxConnections: 5,
      maxMessages: 100,
      rateDelta: 1000, // Rate limiting: 1 second between messages
      rateLimit: 5, // Max 5 messages per rateDelta
      // TLS options for better security
      tls: {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2'
      },
      // Connection timeout
      connectionTimeout: 60000, // 60 seconds
      greetingTimeout: 30000, // 30 seconds
      socketTimeout: 60000, // 60 seconds
    });

    return this.transporter;
  }

  async verifyConnection(): Promise<boolean> {
    if (this.connectionVerified) {
      return true;
    }

    try {
      const transporter = this.createTransporter();
      await transporter!.verify();
      this.connectionVerified = true;
      
      audit('smtp_connection_verified', {
        host: env.smtpHost,
        port: env.smtpPort,
        secure: env.smtpSecure,
        user: env.smtpAuthUser || env.smtpUser
      });
      
      console.log('SMTP connection verified successfully');
      return true;
    } catch (error: any) {
      console.error('SMTP connection verification failed:', error);
      audit('smtp_connection_failed', {
        host: env.smtpHost,
        port: env.smtpPort,
        error: error.message
      });
      return false;
    }
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    try {
      const transporter = this.createTransporter();

      // Verify connection before sending (with caching)
      const isConnected = await this.verifyConnection();
      if (!isConnected) {
        throw new Error('SMTP connection verification failed');
      }

      const mailOptions = {
        from: env.mailFrom,
        to,
        subject,
        html,
        replyTo: env.mailReplyTo || env.mailFrom,
        // Additional headers for better deliverability
        headers: {
          'X-Mailer': 'Tymoe Auth Service',
          'X-Priority': '3', // Normal priority
        },
        // Text fallback (auto-generated from HTML)
        generateTextFromHTML: true,
        // Message ID for tracking
        messageId: `<${Date.now()}.${Math.random().toString(36).substr(2, 9)}@${env.smtpHost}>`,
      };

      const info = await transporter!.sendMail(mailOptions);
      
      audit('email_sent', {
        transport: 'smtp',
        to,
        subject,
        from: env.mailFrom,
        messageId: info.messageId,
        response: info.response,
        contentLength: html.length,
        accepted: info.accepted?.length || 0,
        rejected: info.rejected?.length || 0
      });

      console.log('Email sent successfully:', info.messageId);

      // Handle rejected recipients
      if (info.rejected && info.rejected.length > 0) {
        console.warn('Some recipients were rejected:', info.rejected);
        audit('email_rejected_recipients', {
          to,
          subject,
          rejected: info.rejected
        });
      }

    } catch (error: any) {
      console.error('SMTP send error:', error);
      audit('email_send_failed', {
        transport: 'smtp',
        to,
        subject,
        from: env.mailFrom,
        error: error.message,
        code: error.code,
        command: error.command
      });

      // Re-throw with more context
      throw new Error(`Failed to send email via SMTP: ${error.message}`);
    }
  }

  // Method to close the transporter connection pool
  async close(): Promise<void> {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
      this.connectionVerified = false;
      audit('smtp_connection_closed', {
        host: env.smtpHost
      });
    }
  }
}

// Helper function to test email configuration
export async function testEmailConfiguration(): Promise<{
  success: boolean;
  transport: string;
  error?: string;
}> {
  const mailer = getMailer();
  
  try {
    const canConnect = await mailer.verifyConnection();
    
    return {
      success: canConnect,
      transport: env.mailTransport,
      error: canConnect ? undefined : 'Connection verification failed'
    };
  } catch (error: any) {
    return {
      success: false,
      transport: env.mailTransport,
      error: error.message
    };
  }
}