import React from 'react';
import { LEGAL_CONTACT } from '../legal/contact';

export type LegalKind = 'privacy' | 'terms' | 'data_deletion';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-2">
    <h2 className="text-lg font-bold text-white">{title}</h2>
    <div className="text-sm text-slate-300 leading-relaxed space-y-2">{children}</div>
  </section>
);

const List: React.FC<{ items: string[] }> = ({ items }) => (
  <ul className="list-disc pl-5 space-y-1">
    {items.map((i) => <li key={i}>{i}</li>)}
  </ul>
);

const { company, email, lastUpdated } = LEGAL_CONTACT;

function Privacy() {
  return (
    <>
      <p>{company} is a software service that lets retail shops manage products, orders and customer conversations, with an AI assistant that answers customer questions using the shop's own catalogue. This policy explains what data we handle and why.</p>
      <Section title="Who is responsible for the data">
        <p>Each shop that uses {company} decides what customer information it keeps and is the controller of its own customers' data. {company} processes that data on the shop's behalf to provide the service. For shop owner and staff accounts, {company} is the controller.</p>
      </Section>
      <Section title="What we collect">
        <List items={[
          'Account data: name, email address, hashed password or Google sign-in identifier, role in the shop.',
          'Shop data: shop name, contact details, products, stock, orders and staff the shop enters.',
          'Customer data held for a shop: names, phone numbers, delivery details, orders and the messages customers exchange with the shop or its AI assistant.',
          'WhatsApp data, when a shop connects WhatsApp: the connected number and business name, the message text, media type, timestamps and delivery identifiers of messages sent to or from that number, and (if the shop chooses to import it) existing chat history and contacts.',
          'Technical data: IP address, browser type and security logs used to prevent abuse and to diagnose errors.',
        ]} />
      </Section>
      <Section title="How we use it">
        <List items={[
          'To run the service: show conversations, orders and stock to the shop and answer customers.',
          'To generate AI replies: relevant messages and the shop’s catalogue are sent to our AI provider (Google Gemini) to draft a reply. We do not use shop or customer data to train our own models, and we ask our providers not to train on it.',
          'To secure the service, prevent abuse, enforce rate limits and keep audit logs.',
          'To meet legal obligations.',
        ]} />
        <p>We do not sell personal data and do not use it for advertising.</p>
      </Section>
      <Section title="WhatsApp">
        <p>When a shop connects its WhatsApp number, messages are received and sent through the WhatsApp Business Platform operated by Meta. Meta’s own terms and privacy policy apply to that part of the service. The access key Meta gives us is stored encrypted and is never shown in the browser. A shop can disconnect WhatsApp at any time from the Integrations page; this stops message delivery to {company} immediately and deletes the stored access key.</p>
      </Section>
      <Section title="Who we share data with">
        <p>Only service providers needed to run {company}: cloud hosting (Vercel), database hosting (Supabase), AI processing (Google), sign-in (Google, if used) and WhatsApp messaging (Meta). Each is bound by its own data-protection terms. We may disclose data if the law requires it.</p>
      </Section>
      <Section title="Security">
        <p>Data is encrypted in transit. Secrets such as WhatsApp access keys are encrypted at rest. Each shop’s data is isolated from other shops and access is limited to authorised staff by role. No system is perfectly secure, so we also monitor and log access.</p>
      </Section>
      <Section title="Retention and deletion">
        <p>Shop data is kept while the shop’s account is active. A shop can delete individual customers, conversations, products and staff in the app. To delete an account or ask for your data to be deleted, follow the steps on our <a className="text-indigo-400 underline" href="/data-deletion">data deletion page</a>. Backups are overwritten within 35 days.</p>
      </Section>
      <Section title="Your rights">
        <p>Depending on where you live you may have the right to access, correct, export or delete your personal data, or to object to some processing. If you are a shop’s customer, you can also ask the shop directly. Contact us at {email} and we will respond within 30 days.</p>
      </Section>
      <Section title="Children">
        <p>{company} is not directed at children under 16 and we do not knowingly collect their data.</p>
      </Section>
      <Section title="Changes and contact">
        <p>We will update this page when our practices change and revise the date above. Questions: {email}.</p>
      </Section>
    </>
  );
}

function Terms() {
  return (
    <>
      <p>These terms govern your use of {company}. By creating an account or using the service you agree to them.</p>
      <Section title="The service">
        <p>{company} provides tools for shops to manage catalogues, orders and customer conversations, including an AI assistant and an optional WhatsApp integration. We may improve, change or discontinue features.</p>
      </Section>
      <Section title="Your account">
        <p>You must give accurate information, keep your password and access keys secret, and are responsible for activity under your account and by staff you add.</p>
      </Section>
      <Section title="Acceptable use">
        <List items={[
          'Do not use the service for anything unlawful, deceptive, abusive or harassing, or to send spam.',
          'Only connect WhatsApp numbers you own or are authorised to manage, and follow the WhatsApp Business and Commerce policies.',
          'Do not attempt to access other shops’ data, probe or disrupt the service, or misuse the AI assistant.',
        ]} />
      </Section>
      <Section title="Customer data and consent">
        <p>You are responsible for having a lawful basis to contact and store information about your customers, including any consent required to message them on WhatsApp.</p>
      </Section>
      <Section title="AI replies">
        <p>The AI assistant can make mistakes. Review its answers, especially about prices, stock and orders. You can switch automatic replies off at any time and reply yourself.</p>
      </Section>
      <Section title="Third-party services">
        <p>The service depends on providers such as Meta (WhatsApp), Google, Vercel and Supabase. We are not responsible for outages or policy changes by those providers.</p>
      </Section>
      <Section title="Availability and liability">
        <p>The service is provided "as is" without warranties. To the extent the law allows, {company} is not liable for indirect or consequential losses, and our total liability is limited to the fees you paid in the previous 12 months.</p>
      </Section>
      <Section title="Ending use">
        <p>You may stop using the service and delete your account at any time. We may suspend accounts that break these terms.</p>
      </Section>
      <Section title="Contact">
        <p>{email}</p>
      </Section>
    </>
  );
}

function DataDeletion() {
  return (
    <>
      <p>You can have your data removed from {company} in either of these ways.</p>
      <Section title="If you are a shop owner">
        <List items={[
          'Sign in, open Integrations and choose Disconnect WhatsApp. This stops message delivery and deletes the stored WhatsApp access key.',
          'Delete customers, conversations, products and staff you no longer need from their pages in the app.',
          `To delete your whole account and all its data, email ${email} from your registered address with the subject "Delete my account".`,
        ]} />
      </Section>
      <Section title="If you are a customer who messaged a shop">
        <p>Your messages are held by the shop you contacted. Ask that shop to delete your conversation, or email {email} with the phone number you used and the shop’s name and we will remove it.</p>
      </Section>
      <Section title="If you signed in with Facebook or Meta">
        <p>Email {email} from the address on your account or remove {company} in your Facebook settings under Apps and Websites, then email us so we can delete the stored data.</p>
      </Section>
      <Section title="What happens next">
        <p>We confirm the request within 7 days and delete the data within 30 days. Backups are overwritten within 35 days. We may keep minimal records where the law requires it (for example, order records for tax).</p>
      </Section>
    </>
  );
}

const TITLES: Record<LegalKind, string> = { privacy: 'Privacy Policy', terms: 'Terms of Service', data_deletion: 'Data Deletion' };

export const LegalPage: React.FC<{ kind: LegalKind }> = ({ kind }) => (
  <article className="max-w-3xl mx-auto py-6 space-y-6 text-slate-300">
    <header className="space-y-1">
      <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">{TITLES[kind]}</h1>
      <p className="text-xs text-slate-500">Last updated {lastUpdated}</p>
    </header>
    {kind === 'privacy' && <Privacy />}
    {kind === 'terms' && <Terms />}
    {kind === 'data_deletion' && <DataDeletion />}
    <nav className="pt-4 border-t border-slate-800 text-xs flex gap-4 text-slate-400">
      <a className="hover:text-white" href="/privacy">Privacy</a>
      <a className="hover:text-white" href="/terms">Terms</a>
      <a className="hover:text-white" href="/data-deletion">Data deletion</a>
      <a className="hover:text-white ml-auto" href="/">Home</a>
    </nav>
  </article>
);
