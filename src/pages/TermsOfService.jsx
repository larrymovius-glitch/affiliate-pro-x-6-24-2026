import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-10 max-w-3xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <h1 className="text-3xl font-bold font-heading mb-2">Terms of Service</h1>
      <p className="text-muted-foreground text-sm mb-8">Last updated: June 23, 2026</p>

      <div className="space-y-8 text-sm leading-relaxed">

        <section>
          <h2 className="text-lg font-semibold mb-2">1. Agreement to Terms</h2>
          <p>
            By accessing or using Affiliate Pro X ("the Service"), you agree to be bound by these Terms of Service.
            If you disagree with any part of these terms, you may not access the service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">2. Affiliate Marketing Disclosure</h2>
          <p className="mb-2">
            <strong>FTC Compliance Notice:</strong> Affiliate Pro X is designed for affiliate marketers who promote third-party products.
            When using this service to manage affiliate links, you must:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>Clearly disclose your affiliate relationships to your audience</li>
            <li>Comply with FTC Endorsement Guidelines (16 CFR Part 255)</li>
            <li>Follow each affiliate network's terms of service (ClickBank, Digistore24, eBay, etc.)</li>
            <li>Not engage in deceptive or misleading marketing practices</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">3. User Responsibilities</h2>
          <p className="mb-2">You agree to:</p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>Use the service only for lawful affiliate marketing activities</li>
            <li>Not promote illegal, fraudulent, or prohibited products</li>
            <li>Comply with all applicable laws and regulations in your jurisdiction</li>
            <li>Maintain the confidentiality of your account credentials</li>
            <li>Not use the service to spam, harass, or deceive consumers</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">4. Prohibited Uses</h2>
          <p className="mb-2">You may not use the service to:</p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>Promote adult content, weapons, illegal drugs, or regulated gambling</li>
            <li>Engage in cryptocurrency trading schemes or get-rich-quick programs</li>
            <li>Distribute malware, viruses, or harmful code</li>
            <li>Violate any third-party intellectual property rights</li>
            <li>Attempt to gain unauthorized access to the service or other users' data</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">5. Earnings Disclaimer</h2>
          <p>
            Affiliate Pro X does not guarantee any specific earnings or income results. Affiliate marketing success
            depends on many factors including your effort, market conditions, and compliance with network policies.
            Any earnings displayed in the service are for tracking purposes only and do not represent future performance.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">6. Data and Privacy</h2>
          <p>
            Your use of the service is also governed by our Privacy Policy. We collect and process data as described
            therein, including account information, usage data, and payment preferences.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">7. Account Termination</h2>
          <p>
            We reserve the right to suspend or terminate your account at our sole discretion if you violate these terms,
            engage in fraudulent activity, or violate any affiliate network's policies.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">8. Limitation of Liability</h2>
          <p>
            Affiliate Pro X is provided "as is" without warranties of any kind. We are not liable for any damages
            arising from your use of the service, including but not limited to lost profits, data loss, or business
            interruption.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">9. Changes to Terms</h2>
          <p>
            We may modify these terms at any time. Continued use of the service after changes constitutes acceptance
            of the updated terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">10. Contact</h2>
          <p>
            For questions about these Terms of Service, contact us at:
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