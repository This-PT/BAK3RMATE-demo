import { statusLabel } from '../format.js';

export default function Badge({ status }) {
  return <span className={`badge ${status}`}>{statusLabel(status)}</span>;
}
