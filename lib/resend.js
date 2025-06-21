import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendInvalidSessionEmail = async (recipient) => {
  try {
    const { data, error } = await resend.emails.send({
      from: 'GoFix <onboarding@resend.dev>',
      to: [recipient],
      subject: 'Invalid Session ID – Action Required',
      html: `
        <p>Your current session ID is invalid or expired. Please enter a new session ID using the following link:</p>
        <a href="https://gofix-ad-frontend.vercel.app/">Update Session ID</a>
        <p>The system will retry automatically after the session is updated.</p>
      `,
    });

    if (error) {
      console.error('❌ Error sending email:', error);
      return { success: false, error };
    }

    console.log('✅ Email sent successfully:', data);
    return { success: true, data };
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    return { success: false, error };
  }
}; 