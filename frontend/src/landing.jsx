import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './landing.css';

const links = [
  ['home', 'Home'],
  ['features', 'Features'],
  ['pricing', 'Pricing'],
];

const icons = {
  factory: 'M2 21V10l6 3V9l6 4V8h3V3h3v10h2v8H2Zm4-4h2m3 0h2m3 0h2',
  clipboard: 'M8 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3M8 3h8v4H8zM7 12h10m-10 5h7',
  document: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h7',
  forward: 'm5 5 7 7-7 7m8-14 7 7-7 7',
  machine: 'M4 17h16a2 2 0 0 1 0 4H4a2 2 0 0 1 0-4Zm3 0v-5h8v5m3-5V3h3v9z',
  calendar: 'M3 6h18v15H3zM3 10h18M7 3v5m10-5v5M7 14h2m3 0h2m3 0h1M7 17h2m3 0h2',
  voice: 'M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0m-7 7v4m-4 0h8',
  layers: 'm2 8 10-5 10 5-10 5-10-5Zm0 5 10 5 10-5m-20 5 10 5 10-5',
  language: 'M2 5h12M8 2v3m4 0c-1 5-4 8-9 11m2-8c2 4 4 6 7 8m1 5 4-11 5 11m-8-3h7',
  robot: 'M3 22h18M7 22v-5h9v5m-8-5 2-8m4 8 1-5m-5-3 5-5 4 4-4 4zM19 8l3 2v4',
  arrow: 'M3 12h17m-7-7 7 7-7 7',
  check: 'm4 12 5 5L20 6',
  info: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 11v6m0-10h.01',
};

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={icons[name]} />
    </svg>
  );
}

function Navigation({ footer = false }) {
  return (
    <nav aria-label={footer ? 'Footer' : 'Main'}>
      {links.map(([id, label]) => <a href={`#${id}`} key={id}>{label}</a>)}
    </nav>
  );
}

function OpenAppLink({ compact = false }) {
  return (
    <a className={compact ? 'sb-button sb-header-app' : 'sb-button'} href="/app">
      {compact ? 'Open app' : 'Open operations workspace'} <Icon name="arrow" />
    </a>
  );
}

function Wordmark() {
  return <a className="sb-wordmark" href="#home"><Icon name="factory" />ShiftBrief</a>;
}

const steps = [
  { title: 'Capture the issue', icon: 'clipboard', copy: 'Record what happened on the floor, which equipment was affected, and what the team observed.' },
  { title: 'Build the handover', icon: 'document', copy: 'Turn shift activity into a structured brief the next crew can pick up quickly.' },
  { title: 'Carry work forward', icon: 'forward', copy: 'Pass open actions, ownership, and operating context to the next shift.' },
];

const planned = [
  { title: 'Voice and text reporting', icon: 'voice', copy: 'Report issues in the language you work in, by speaking or typing.' },
  { title: 'Document-grounded AI', icon: 'layers', copy: 'Use SOPs, manuals, and incident history to ask follow-up questions and draft reports for review.' },
  { title: 'Multilingual shift summaries', icon: 'language', copy: 'Brief each crew in its working language and track escalations and acknowledgments.' },
  { title: 'Machine-event integrations', icon: 'robot', copy: 'Bring events from AMRs, robotic arms, and factory systems into the handover.' },
];

const plans = [
  {
    name: 'Floor',
    description: 'Get one department off paper handovers.',
    price: '€79',
    annualPrice: '€790',
    setup: 'No setup fee',
    features: [
      '1 department · up to 15 workers',
      'Shift scheduling and reporting questions',
      'Machine condition and history',
      'Shift reports, handovers and issue follow-up',
      'AI analysis off',
    ],
  },
  {
    name: 'Plant',
    description: 'Coordinate handovers across departments.',
    price: '€249',
    annualPrice: '€2,490',
    setup: '€400 one-time setup on monthly billing',
    recommended: true,
    features: [
      'All Floor tools · unlimited departments',
      'Up to 80 workers',
      'Plant overview and department drill-down',
      'Optional AI: 400 report analyses per month, then €0.15 each',
      'One setup call',
    ],
  },
  {
    name: 'Operations',
    description: 'Cover more workers and reports at one plant.',
    price: '€490',
    annualPrice: '€4,900',
    setup: '€400 one-time setup on monthly billing',
    features: [
      'All Plant tools · unlimited departments',
      'Unlimited workers',
      'Plant overview and department drill-down',
      'Optional AI: 2,000 report analyses per month, then €0.12 each',
      'Guided setup of your reporting questions',
    ],
  },
];

function HandoverExample() {
  return (
    <aside className="sb-sample" aria-label="Sample shift handover">
      <div className="sb-sample-head">
        <Icon name="document" />
        <div><h3>Shift handover</h3><span>Line A · Evening shift</span></div>
        <span className="sb-tag">Sample</span>
      </div>
      <dl>
        <div><dt>Issue</dt><dd>Filler 2 stopped after an infeed jam.</dd></div>
        <div><dt>Actions taken</dt><dd>Maintenance cleared the jam and logged the restart.</dd></div>
        <div><dt>Next shift</dt><dd>Check for repeat stops and record the outcome in the follow-up queue.</dd></div>
      </dl>
    </aside>
  );
}

function Features() {
  return (
    <section className="sb-section sb-wrap" id="features" aria-labelledby="features-title">
      <p className="sb-label">Features</p>
      <h2 id="features-title">From the floor to the next shift.</h2>
      <p className="sb-intro">Record what happened on the floor and give the next crew a clear handover.</p>
      <div className="sb-workflow">
        <ol className="sb-steps">
          {steps.map(({ title, icon, copy }, index) => (
            <li key={title}>
              <div className="sb-step-head"><span aria-hidden="true">{index + 1}</span><h3>{title}</h3></div>
              <p>{copy}</p>
              <Icon name={icon} />
            </li>
          ))}
        </ol>
        <HandoverExample />
      </div>
      <div className="sb-current">
        <div><p className="sb-label">Available today</p><h3>Organize day-to-day operations.</h3></div>
        <div><Icon name="machine" /><div><h4>Machine status</h4><p>Track equipment condition and see who last updated it.</p></div></div>
        <div><Icon name="calendar" /><div><h4>Shift assignments</h4><p>Schedule workers and attach reporting questions to each shift.</p></div></div>
      </div>
      <div className="sb-roadmap">
        <div>
          <p className="sb-label">Planned capabilities</p>
          <h3>A shared memory for the factory.</h3>
          <p>Keep operational context moving between crews and the machines they work with.</p>
        </div>
        <ul>
          {planned.map(({ title, icon, copy }) => (
            <li key={title}><Icon name={icon} /><h4>{title}</h4><p>{copy}</p></li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section className="sb-section sb-pricing" id="pricing" aria-labelledby="pricing-title">
      <div className="sb-wrap">
        <p className="sb-label">Early access pricing</p>
        <h2 id="pricing-title">One subscription per plant.</h2>
        <p className="sb-intro">Start with one department or coordinate across the plant. Owners, managers and workers within your plan are included.</p>
        <div className="sb-price-note">
          <Icon name="info" />
          <div>
            <strong>Prepay for a year and get two months free</strong>
            <p>Annual prices cover the platform for 12 months, with setup included. Extra AI usage is charged separately.</p>
          </div>
        </div>
        <div className="sb-plans">
          {plans.map(({ name, description, price, annualPrice, setup, recommended, features }) => (
            <article className={recommended ? 'sb-plan sb-plan-highlight' : 'sb-plan'} key={name}>
              <div className="sb-plan-head">
                <h3>{name}</h3>
                {recommended ? <span className="sb-plan-badge">Recommended</span> : null}
                <p>{description}</p>
              </div>
              <div className="sb-plan-body">
                <div className="sb-price">
                  <p><strong>{price}</strong><span> / plant / month</span></p>
                  <p className="sb-annual-price">{annualPrice} per plant, paid yearly</p>
                  <p className="sb-setup-price">{setup}</p>
                </div>
                <ul>{features.map(feature => <li key={feature}><Icon name="check" />{feature}</li>)}</ul>
              </div>
            </article>
          ))}
        </div>
        <div className="sb-pricing-details">
          <p><strong>AI is optional.</strong> When enabled, submitted questions, answers, notes and issue text are sent to Google Gemini. Crews can file reports and track issues with AI off.</p>
          <p><strong>Each plant has its own workspace.</strong> A second plant uses a separate subscription. On-premises deployments are quoted separately.</p>
        </div>
      </div>
    </section>
  );
}

function Landing() {
  useEffect(() => {
    const target = links.find(([id]) => window.location.hash === `#${id}`);
    if (target) document.getElementById(target[0])?.scrollIntoView();
  }, []);

  return (
    <div className="sb-site" id="home">
      <header className="sb-header sb-wrap">
        <Wordmark />
        <Navigation />
        <OpenAppLink compact />
      </header>
      <main className="sb-main">
        <section className="sb-hero" aria-labelledby="home-title">
          <div className="sb-hero-copy">
            <h1 id="home-title">Every shift <span>starts informed.</span></h1>
            <p>ShiftBrief is built for industrial shift handovers. Give incoming crews a clear view of what happened, what’s still open, and what needs their attention.</p>
            <OpenAppLink />
          </div>
          <img src="/shiftbrief-factory.webp" alt="Two factory workers reviewing a tablet on the production floor" width="1448" height="1086" fetchPriority="high" />
        </section>
        <Features />
        <Pricing />
      </main>
      <footer className="sb-footer">
        <div className="sb-wrap"><Wordmark /><Navigation footer /></div>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><Landing /></StrictMode>);
