import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useAuth } from '../auth.jsx';
import { Field, inputCls, btnCls } from '../components/ui.jsx';

const STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-800', approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-700', cancelled: 'bg-slate-200 text-slate-600',
};
const TYPE_LABEL = { casual: 'Casual', sick: 'Sick', unpaid: 'Unpaid' };

export default function Leave() {
  const { user } = useAuth();
  const manager = ['owner', 'admin'].includes(user.role);
  const qc = useQueryClient();
  const [status, setStatus] = useState('all');
  const [f, setF] = useState({ employeeId: '', leaveType: 'casual', startDate: '', endDate: '', reason: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const { data: balances = [] } = useQuery({ queryKey: ['leave-balances'], queryFn: () => api('/hr/leave/balances') });
  const { data: requests = [], isLoading } = useQuery({ queryKey: ['leave', status], queryFn: () => api(`/hr/leave?status=${status}`) });
  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: () => api('/hr/employees'), enabled: manager });

  const refresh = () => { qc.invalidateQueries({ queryKey: ['leave'] }); qc.invalidateQueries({ queryKey: ['leave-balances'] }); };

  const request = useMutation({
    mutationFn: () => api('/hr/leave', {
      method: 'POST',
      body: {
        employeeId: manager && f.employeeId ? Number(f.employeeId) : null,
        leaveType: f.leaveType, startDate: f.startDate, endDate: f.endDate, reason: f.reason || null,
      },
    }),
    onSuccess: () => { setF({ ...f, startDate: '', endDate: '', reason: '' }); refresh(); },
  });
  const decide = useMutation({
    mutationFn: ({ id, decision, note }) => api(`/hr/leave/${id}/decision`, { method: 'POST', body: { decision, note: note || null } }),
    onSuccess: refresh,
  });
  const cancel = useMutation({ mutationFn: (id) => api(`/hr/leave/${id}/cancel`, { method: 'POST', body: {} }), onSuccess: refresh });

  const today = new Date().toLocaleDateString('en-CA');

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{manager ? 'Leave' : 'My leave'}</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {balances.map((b) => (
          <div key={b.id} className="rounded-xl border bg-white p-4">
            <p className="font-semibold">{b.full_name}</p>
            <p className="text-xs text-slate-500">{b.job_title}</p>
            <p className="mt-2 text-2xl font-bold">{b.remaining}<span className="text-sm font-normal text-slate-500"> of {b.allowance} paid days left</span></p>
            <p className="text-xs text-slate-500">taken {b.used} · pending {b.pending} · unpaid taken {b.unpaid_taken}</p>
          </div>
        ))}
        {balances.length === 0 && <p className="text-sm text-slate-500">No employee profile is linked to your login yet. Ask the owner to link it under Payroll → Employees.</p>}
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-semibold">Request leave</h2>
        <div className="grid gap-3 md:grid-cols-6">
          {manager && (
            <div className="md:col-span-2">
              <Field label="Employee">
                <select className={inputCls} value={f.employeeId} onChange={set('employeeId')}>
                  <option value="">Select…</option>
                  {employees.filter((e) => e.is_active).map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </Field>
            </div>
          )}
          <Field label="Type">
            <select className={inputCls} value={f.leaveType} onChange={set('leaveType')}>
              <option value="casual">Casual</option><option value="sick">Sick</option><option value="unpaid">Unpaid</option>
            </select>
          </Field>
          <Field label="From"><input type="date" className={inputCls} value={f.startDate} onChange={set('startDate')} /></Field>
          <Field label="To"><input type="date" className={inputCls} min={f.startDate} value={f.endDate} onChange={set('endDate')} /></Field>
          <div className={manager ? 'md:col-span-6' : 'md:col-span-2'}>
            <Field label="Reason (optional)"><input className={inputCls} value={f.reason} onChange={set('reason')} /></Field>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button className={btnCls} disabled={request.isPending || !f.startDate || !f.endDate || (manager && !f.employeeId)} onClick={() => request.mutate()}>Submit request</button>
          <span className="text-xs text-slate-500">Days are counted as calendar days, start and end included.</span>
        </div>
        {request.error && <p className="mt-2 text-sm text-red-600">{request.error.message}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {['all', 'pending', 'approved', 'rejected', 'cancelled'].map((s) => (
          <button key={s} onClick={() => setStatus(s)}
                  className={`rounded-full px-3 py-1 text-sm capitalize ${status === s ? 'bg-emerald-600 text-white' : 'border bg-white hover:bg-slate-100'}`}>{s}</button>
        ))}
      </div>
      {(decide.error || cancel.error) && <p className="text-sm text-red-600">{(decide.error || cancel.error).message}</p>}

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr><th className="p-3">Employee</th><th className="p-3">Type</th><th className="p-3">Dates</th><th className="p-3">Days</th><th className="p-3">Reason</th><th className="p-3">Status</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td className="p-3" colSpan={7}>Loading…</td></tr>}
            {requests.map((l) => {
              const canCancel = l.status === 'pending' || (l.status === 'approved' && l.start_date > today);
              return (
                <tr key={l.id} className="border-t">
                  <td className="p-3 font-medium">{l.full_name}</td>
                  <td className="p-3">{TYPE_LABEL[l.leave_type]}</td>
                  <td className="p-3">{l.start_date} → {l.end_date}</td>
                  <td className="p-3">{l.days}</td>
                  <td className="p-3 text-slate-600">{l.reason ?? '—'}{l.decision_note && <span className="block text-xs text-slate-500">“{l.decision_note}” · {l.decided_by_name}</span>}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[l.status]}`}>{l.status}</span></td>
                  <td className="p-3 text-right">
                    <span className="flex justify-end gap-2">
                      {manager && l.status === 'pending' && (
                        <>
                          <button className={btnCls} disabled={decide.isPending} onClick={() => decide.mutate({ id: l.id, decision: 'approved' })}>Approve</button>
                          <button className="text-red-600 hover:underline" disabled={decide.isPending}
                                  onClick={() => decide.mutate({ id: l.id, decision: 'rejected', note: window.prompt('Reason (optional)') })}>Reject</button>
                        </>
                      )}
                      {canCancel && <button className="text-slate-500 hover:underline" onClick={() => cancel.mutate(l.id)}>Cancel</button>}
                    </span>
                  </td>
                </tr>
              );
            })}
            {!isLoading && requests.length === 0 && <tr><td className="p-3 text-slate-500" colSpan={7}>No leave requests.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
