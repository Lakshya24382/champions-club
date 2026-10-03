import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import ReportView from '../components/ReportView.jsx';

export default function SharedReport() {
  const { token } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['shared-report', token],
    queryFn: () => api(`/public/report/${token}`),
  });

  if (isLoading) return <p className="p-6">Loading…</p>;
  if (error) return <p className="p-6 text-red-600">{error.message}</p>;

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-8">
      <div>
        <p className="text-sm text-slate-500">{data.club_name} · shared report</p>
        <h1 className="text-3xl font-bold">{data.title}</h1>
        <p className="text-sm text-slate-600">
          {data.from_date} to {data.to_date} · numbers frozen on {new Date(data.created_at).toLocaleString()} · link valid until {new Date(data.expires_at).toLocaleDateString()}
        </p>
      </div>
      <ReportView r={data.snapshot} />
    </div>
  );
}
