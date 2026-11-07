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
  { name: 'Pilot', description: 'For a team getting started at one site.', price: '€99', features: ['Machine register and status history', 'Shift assignments', 'Reusable reporting questions'] },
  { name: 'Plant', description: 'For teams coordinating across a plant.', price: '€299', features: ['Everything in Pilot', 'AI-assisted handover reports', 'Multilingual summaries and escalations'] },
  { name: 'Enterprise', description: 'For complex or multi-site operations.', price: 'Custom', features: ['Everything in Plant', 'Multi-site coordination', 'Robot and factory-system integrations'] },
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
        <div><dt>Next shift</dt><dd>Check for repeat stops and update the maintenance ticket.</dd></div>
      </dl>
    </aside>
  );
}

function Features() {
  return (
    <section className="sb-section sb-wrap" id="features" aria-labelledby="features-title">
      <p className="sb-label">Features</p>
      <h2 id="features-title">From the floor to the next shift.</h2>
      <p className="sb-intro">A preview of how ShiftBrief will turn floor updates into a handover the next crew can act on.</p>
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
        <h2 id="pricing-title">Plans for every plant.</h2>
        <p className="sb-intro">Example packages for a single team, an entire plant, or multiple sites.</p>
        <div className="sb-price-note">
          <Icon name="info" />
          <div><strong>Illustrative pricing</strong><p>These example packages include planned capabilities. Prices are for illustration only.</p></div>
        </div>
        <div className="sb-plans">
          {plans.map(({ name, description, price, features }) => (
            <article className={name === 'Plant' ? 'sb-plan sb-plan-highlight' : 'sb-plan'} key={name}>
              <div className="sb-plan-head"><h3>{name}</h3><p>{description}</p></div>
              <div className="sb-plan-body">
                <p className="sb-price"><strong>{price}</strong>{price !== 'Custom' && <span> / site / month</span>}</p>
                <ul>{features.map(feature => <li key={feature}><Icon name="check" />{feature}</li>)}</ul>
              </div>
            </article>
          ))}
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
      </header>
      <main className="sb-main">
        <section className="sb-hero" aria-labelledby="home-title">
          <div className="sb-hero-copy">
            <h1 id="home-title">Every shift <span>starts informed.</span></h1>
            <p>ShiftBrief is built for industrial shift handovers. Give incoming crews a clear view of what happened, what’s still open, and what needs their attention.</p>
            <a className="sb-button" href="#features">Explore features <Icon name="arrow" /></a>
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
