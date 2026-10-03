import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import {
  Modal, Field, inputCls, btnCls, btnGhostCls, btnDangerCls,
  Table, Th, Td, toast, PageLoader, EmptyState,
} from '../components/ui.jsx';

const ROLE_BADGE = {
  owner: 'pill amber',
  admin: 'pill info',
  staff: 'pill muted',
};

function UserModal({ user, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!user;
  const [f, setF] = useState({
    name: user?.name ?? '',
    email: user?.email ?? '',
    password: '',
    role: user?.role ?? 'staff',
    isActive: user?.is_active ?? true,
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = useMutation({
    mutationFn: () => {
      if (isEdit) {
        const body = { name: f.name, role: f.role, isActive: f.isActive };
        if (f.password) body.password = f.password;
        return api(`/auth/users/${user.id}`, { method: 'PATCH', body });
      }
      return api('/auth/users', {
        method: 'POST',
        body: { name: f.name, email: f.email, password: f.password, role: f.role },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-users'] });
      toast(isEdit ? 'Staff member updated ✓' : 'Staff member created ✓');
      onClose();
    },
    onError: (err) => toast(err.message, 'error'),
  });

  return (
    <Modal title={isEdit ? `Edit: ${user.name}` : 'New staff member'} onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Full name">
          <input required className={inputCls} value={f.name} onChange={set('name')} placeholder="e.g. Rahul Mehta" />
        </Field>
        {!isEdit && (
          <Field label="Email">
            <input required type="email" className={inputCls} value={f.email} onChange={set('email')} placeholder="rahul@champions.club" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={isEdit ? 'New password (leave blank to keep)' : 'Password (min 8 chars)'}>
            <input
              type="password" className={inputCls} value={f.password} onChange={set('password')}
              minLength={isEdit ? 0 : 8} required={!isEdit}
              placeholder={isEdit ? 'Leave blank to keep current' : 'Minimum 8 characters'}
            />
          </Field>
          <Field label="Role">
            <select className={inputCls} value={f.role} onChange={set('role')}>
              <option value="staff">Staff (front desk)</option>
              <option value="admin">Admin (manager)</option>
              <option value="owner">Owner (full access)</option>
            </select>
          </Field>
        </div>
        {isEdit && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.isActive} onChange={set('isActive')} />
            Account is active (uncheck to disable login)
          </label>
        )}
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <b>Role permissions:</b><br />
          Staff — courts, members, bar, shop, leave.<br />
          Admin — all of the above + finance, invoices, payroll.<br />
          Owner — full access including user management.
        </div>
        {save.error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {save.error.message}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btnGhostCls} onClick={onClose}>Cancel</button>
          <button className={btnCls} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create staff member'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Staff() {
  const [modal, setModal] = useState(null); // null | 'new' | user object

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['staff-users'],
    queryFn: () => api('/auth/users'),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Staff & Users</h1>
          <p className="mt-0.5 text-sm text-slate-500">Manage who can log in and what they can do</p>
        </div>
        <button className={btnCls} onClick={() => setModal('new')}>+ Add staff member</button>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <EmptyState icon="👤" title="No staff accounts" description="Add your first staff member to get started." />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className="transition-colors hover:bg-slate-50">
                <Td className="font-medium">{u.name}</Td>
                <Td className="text-slate-500 font-mono text-xs">{u.email}</Td>
                <Td><span className={ROLE_BADGE[u.role]}>{u.role}</span></Td>
                <Td>
                  <span className={`pill ${u.is_active ? 'success' : 'muted'}`}>
                    {u.is_active ? 'Active' : 'Disabled'}
                  </span>
                </Td>
                <Td className="text-slate-500 text-sm">
                  {new Date(u.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Td>
                <Td>
                  <button className="text-sm text-emerald-700 hover:underline" onClick={() => setModal(u)}>Edit</button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {modal && <UserModal user={modal === 'new' ? null : modal} onClose={() => setModal(null)} />}
    </div>
  );
}
