import { useState } from 'react';
import { dateLabel, timeRange } from './shift-time';

const paths = {
  mark: 'M2 13h5l3-7 4 12 3-5h5',
  overview: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  shifts: 'M4 6h16v15H4zM8 3v6m8-6v6M4 11h16',
  report: 'M6 3h9l4 4v14H6zM9 12h7m-7 4h7',
  mic: 'M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM5 10v1a7 7 0 0 0 14 0v-1m-7 8v4m-4 0h8',
  stop: 'M6 6h12v12H6z',
  machines: 'M3 21V10l6 3V9l6 3 1-9h4l1 18zM6 17h2m3 0h2m3 0h2',
  staff: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm4-4a4 4 0 0 1 0 8',
  exit: 'M10 3H4v18h6m4-14 5 5-5 5m-5-5h10',
  alert: 'M12 3 2 21h20L12 3Zm0 6v5m0 3v.1',
  flag: 'M4 22V3m0 1c7-5 9 5 16 0v12c-7 5-9-5-16 0',
  clock: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 6v6l4 2',
  arrow: 'M4 12h15m-6-6 6 6-6 6',
  refresh: 'M20 8a8 8 0 1 0 0 8m0-12v5h-5',
};

export function Icon({ name }) {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d={paths[name]} />
  </svg>;
}

export function PageTitle({ title, subtitle, now, action }) {
  return <header className="ops-heading">
    <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
    <div className="ops-heading-actions">{now !== undefined && <span>{dateLabel(now)}</span>}{action}</div>
  </header>;
}

export function Metrics({ items }) {
  return <dl className="ops-metrics" style={{ '--metric-count': items.length }}>
    {items.map(([label, value, icon, urgent]) => (
      <div className="ops-metric" key={label} data-urgent={urgent || undefined}>
        {icon && <span className="metric-icon"><Icon name={icon} /></span>}
        <dt>{label}</dt><dd>{value}</dd>
      </div>
    ))}
  </dl>;
}

const tones = { 'In progress': 'good', Submitted: 'good', 'Submitted late': 'attention', Due: 'attention',
  Overdue: 'urgent', Draft: 'attention', 'Report overdue': 'urgent', 'Worker report': 'attention', 'Machine fault': 'attention' };

export function Badge({ children }) {
  return <span className="ops-badge" data-tone={tones[children]}>{children}</span>;
}

export function ShiftWhen({ shift, showDate = true }) {
  return <div className="shift-when">
    {showDate && <strong>{dateLabel(shift.starts_at)}</strong>}
    <span>{timeRange(shift)}</span>
  </div>;
}

export function Empty({ children }) {
  return <p className="ops-empty">{children}</p>;
}

export function Table({ columns, rows, render, empty, label, pageSize = 8 }) {
  const [limit, setLimit] = useState(pageSize);
  if (!rows.length) return <Empty>{empty}</Empty>;
  return <>
    <div className="ops-table-frame" tabIndex={0} role="region" aria-label={label}>
      <table className="ops-table" role="table">
        <thead role="rowgroup"><tr role="row">{columns.map((column) => <th role="columnheader" scope="col" key={column}>{column}</th>)}</tr></thead>
        <tbody role="rowgroup">{rows.slice(0, limit).map(render)}</tbody>
      </table>
    </div>
    {rows.length > limit && <button className="secondary ops-more" type="button"
      onClick={() => setLimit((previous) => previous + pageSize)}>Show more ({rows.length - limit} remaining)</button>}
  </>;
}
