import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-10 max-w-3xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <h1 className="text-3xl font-bold font-heading mb-2">Privacy Policy</h1>
      <p className="text-muted-foreground text-sm mb-8">Last updated: June 13, 2026</p>

      <div className="space-y-8 text-sm leading-relaxed">

        <section>
          <h2 className="text-lg font-semibold mb-2">1. Introduction</h2>
          <p>
            Welcome to <strong>Affiliate Pro X</strong> ("we," "our," or "us"). We are committed to protecting your
            personal information and your right to privacy. This Privacy Policy explains how we collect, use, and
            safeguard your information when you use our mobile application and web platform.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">2. Information We Collect</h2>
          <p className="mb-2">We may collect the following types of information:</p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li><strong className="text-foreground">Account Information:</strong> Name, email address, and password when you register.</li>
            <li><strong className="text-foreground">Usage Data:</strong> Information about how you use the app, including clicks, conversions, and campaign activity.</li>
            <li><strong className="text-foreground">Payment Information:</strong> Payout preferences such as PayPal email or bank transfer details (we do not store full payment credentials).</li>
            <li><strong className="text-foreground">Device Information:</strong> Device type, operating system, and app version for analytics and performance purposes.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">3. How We Use Your Information</h2>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>To provide, operate, and maintain our services.</li>
            <li>To process affiliate link tracking, campaign management, and payout requests.</li>
            <li>To send important account notifications and updates.</li>
            <li>To improve, personalize, and expand our app functionality.</li>
            <li>To detect and prevent fraudulent activity.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">4. Sharing Your Information</h2>
          <p>
            We do not sell, trade, or rent your personal information to third parties. We may share data with
            trusted service providers who assist us in operating our platform, provided they agree to keep your
            information confidential. We may also disclose information if required by law.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">5. Data Retention</h2>
          <p>
            We retain your personal information for as long as your account is active or as needed to provide
            services. You may request deletion of your account and associated data at any time through the app
            settings.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">6. Security</h2>
          <p>
            We implement industry-standard security measures to protect your information. However, no method of
            transmission over the internet is 100% secure. We encourage you to use a strong, unique password
            for your account.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">7. Children's Privacy</h2>
          <p>
            Our app is not directed to children under the age of 13. We do not knowingly collect personal
            information from children. If you believe a child has provided us with personal data, please contact
            us so we can delete it.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">8. Your Rights</h2>
          <p className="mb-2">Depending on your location, you may have the right to:</p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>Access the personal data we hold about you.</li>
            <li>Request correction of inaccurate data.</li>
            <li>Request deletion of your data.</li>
            <li>Withdraw consent at any time.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of any significant changes
            by updating the date at the top of this page. Continued use of the app after changes constitutes
            your acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">10. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact us at:
          </p>
          <p className="mt-2 text-muted-foreground">
            <strong className="text-foreground">Affiliate Pro X</strong><br />
            Email: <a href="mailto:support@affiliateprox.com" className="text-primary underline">support@affiliateprox.com</a>
          </p>
        </section>

      </div>
    </div>
  );
}