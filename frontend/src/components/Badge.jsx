import { STATUS_LABEL } from '../format.js';

export default function Badge({ status }) {
  return <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>;
}
