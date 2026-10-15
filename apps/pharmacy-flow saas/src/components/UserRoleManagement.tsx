import React, { useEffect, useState } from 'react';
import { Users, Shield, Plus, Trash2, Edit2, Check, X, ShieldCheck, UserPlus } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { User, Role } from '../types';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';

export default function UserRoleManagement({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const { user: currentUser } = useAuth();
  const { showNotification } = useNotification();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'branches'>('users');

  // User Form State
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userName, setUserName] = useState('');
  const [userUsername, setUserUsername] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRoleId, setUserRoleId] = useState('');
  const [userBranchId, setUserBranchId] = useState('');
  const [branches, setBranches] = useState<any[]>([]);

  // Role Form State
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleName, setRoleName] = useState('');
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);

  // Branch Form State
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<any | null>(null);
  const [branchName, setBranchName] = useState('');
  const [branchLocation, setBranchLocation] = useState('');
  const [branchPhone, setBranchPhone] = useState('');

  useEffect(() => {
    const isDirty = (isUserModalOpen && (userName !== '' || userUsername !== '')) || 
                    (isRoleModalOpen && (roleName !== '' || rolePermissions.length > 0)) ||
                    (isBranchModalOpen && branchName !== '');
    if (onDirtyChange) onDirtyChange(isDirty);
    return () => { if (onDirtyChange) onDirtyChange(false); };
  }, [isUserModalOpen, userName, userUsername, isRoleModalOpen, roleName, rolePermissions, isBranchModalOpen, branchName, onDirtyChange]);

  const availablePermissions = [
    { id: 'dashboard', name: 'Dashboard Access' },
    { id: 'inventory', name: 'Manage Inventory' },
    { id: 'sales', name: 'Process Sales' },
    { id: 'accounts', name: 'Manage Accounts' },
    { id: 'history', name: 'View Transaction History' },
    { id: 'reports', name: 'View Reports' },
    { id: 'expenses', name: 'Manage Expenses' },
    { id: 'purchases', name: 'Manage Purchases' },
    { id: 'market-list', name: 'Manage Market Orders' },
    { id: 'calendar', name: 'View Calendar' },
    { id: 'returns', name: 'Manage Returns' },
    { id: 'payroll', name: 'Manage Payroll' },
    { id: 'referrals', name: 'Referral Program & Incentives' },
    { id: 'subscriptions', name: 'Manage Subscriptions' },
    { id: 'users', name: 'Manage Users & Roles' },
    { id: 'settings', name: 'Manage Settings' },
    { id: 'branches', name: 'Manage Branches' }
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [usersRes, rolesRes, branchesRes] = await Promise.all([
        apiFetch('/api/users'),
        apiFetch('/api/roles'),
        apiFetch('/api/branches')
      ]);
      const usersData = await usersRes.json();
      const rolesData = await rolesRes.json();
      const branchesData = await branchesRes.json();
      setUsers(Array.isArray(usersData) ? usersData : []);
      setRoles(Array.isArray(rolesData) ? rolesData : []);
      setBranches(Array.isArray(branchesData) ? branchesData : []);
    } catch (err) {
      console.error('Failed to fetch users/roles/branches', err);
      setUsers([]);
      setRoles([]);
      setBranches([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      const res = await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification('success', 'User deleted successfully');
        fetchData();
      } else {
        const err = await res.json();
        showNotification('error', err.error || 'Failed to delete user');
      }
    } catch (err) {
      showNotification('error', 'An error occurred');
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: userName,
      username: userUsername.toLowerCase(),
      password: userPassword || undefined,
      roleId: userRoleId,
      branchId: userBranchId
    };

    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showNotification('success', `User ${editingUser ? 'updated' : 'created'} successfully`);
        setIsUserModalOpen(false);
        fetchData();
        resetUserForm();
      } else {
        const errData = await res.json();
        showNotification('error', errData.error || 'Failed to save user');
        console.error('Failed to save user', errData);
      }
    } catch (err) {
      showNotification('error', 'An error occurred while saving user');
      console.error('Failed to save user', err);
    }
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: roleName,
      permissions: rolePermissions
    };

    try {
      const url = editingRole ? `/api/roles/${editingRole.id}` : '/api/roles';
      const method = editingRole ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showNotification('success', `Role ${editingRole ? 'updated' : 'created'} successfully`);
        setIsRoleModalOpen(false);
        fetchData();
        resetRoleForm();
      } else {
        const errData = await res.json();
        showNotification('error', errData.error || 'Failed to save role');
        console.error('Failed to save role', errData);
      }
    } catch (err) {
      showNotification('error', 'An error occurred while saving role');
      console.error('Failed to save role', err);
    }
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: branchName,
      location: branchLocation,
      phone: branchPhone
    };

    try {
      const url = editingBranch ? `/api/branches/${editingBranch.id}` : '/api/branches';
      const method = editingBranch ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        showNotification('success', `Branch ${editingBranch ? 'updated' : 'created'} successfully`);
        setIsBranchModalOpen(false);
        fetchData();
        if (isUserModalOpen && !editingBranch && data.id) {
          setUserBranchId(data.id);
        }
        resetBranchForm();
      } else {
        const errData = await res.json();
        showNotification('error', errData.error || 'Failed to save branch');
        console.error('Failed to save branch', errData);
      }
    } catch (err) {
      showNotification('error', 'An error occurred while saving branch');
      console.error('Failed to save branch', err);
    }
  };

  const resetUserForm = () => {
    setEditingUser(null);
    setUserName('');
    setUserUsername('');
    setUserPassword('');
    setUserRoleId('');
    setUserBranchId('');
  };

  const resetRoleForm = () => {
    setEditingRole(null);
    setRoleName('');
    setRolePermissions([]);
  };

  const resetBranchForm = () => {
    setEditingBranch(null);
    setBranchName('');
    setBranchLocation('');
    setBranchPhone('');
  };

  const togglePermission = (permId: string) => {
    setRolePermissions(prev => 
      prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]
    );
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setUserName(user.name);
    setUserUsername(user.username);
    setUserRoleId(user.roleId || '');
    setUserBranchId(user.branchId || '');
    setIsUserModalOpen(true);
  };

  const handleEditRole = (role: Role) => {
    setEditingRole(role);
    setRoleName(role.name);
    setRolePermissions(role.permissions);
    setIsRoleModalOpen(true);
  };

  const handleEditBranch = (branch: any) => {
    setEditingBranch(branch);
    setBranchName(branch.name);
    setBranchLocation(branch.location || '');
    setBranchPhone(branch.phone || '');
    setIsBranchModalOpen(true);
  };

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="space-y-10">
      <div className="flex flex-col items-center text-center gap-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-brand-text">Users & Roles</h2>
          <p className="text-sm text-brand-muted mt-1">Manage system access and permission levels</p>
        </div>
        <div className="flex flex-col items-center justify-center gap-6 w-full">
        <div className="bg-brand-surface/60 backdrop-blur-md p-1.5 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.1)] border border-brand-border/50 flex items-center gap-1">
            <button
              onClick={() => setActiveTab('users')}
              className={`flex items-center space-x-1.5 px-3 md:px-6 py-2 md:py-3 rounded-full font-bold transition-all text-[10px] md:text-sm ${
                activeTab === 'users' ? 'bg-brand-accent text-white shadow-lg shadow-brand-accent/20' : 'text-brand-muted hover:text-brand-text'
              }`}
            >
              <Users size={14} className="md:w-5 md:h-5" />
              <span>Users</span>
            </button>
            <button
              onClick={() => setActiveTab('roles')}
              className={`flex items-center space-x-1.5 px-3 md:px-6 py-2 md:py-3 rounded-full font-bold transition-all text-[10px] md:text-sm ${
                activeTab === 'roles' ? 'bg-brand-accent text-white shadow-lg shadow-brand-accent/20' : 'text-brand-muted hover:text-brand-text'
              }`}
            >
              <Shield size={14} className="md:w-5 md:h-5" />
              <span>Roles</span>
            </button>
            <button
              onClick={() => setActiveTab('branches')}
              className={`flex items-center space-x-1.5 px-3 md:px-6 py-2 md:py-3 rounded-full font-bold transition-all text-[10px] md:text-sm ${
                activeTab === 'branches' ? 'bg-brand-accent text-white shadow-lg shadow-brand-accent/20' : 'text-brand-muted hover:text-brand-text'
              }`}
            >
              <Shield size={14} className="md:w-5 md:h-5" />
              <span>Branches</span>
            </button>
          </div>

          <button
            onClick={() => {
              if (activeTab === 'users') setIsUserModalOpen(true);
              else if (activeTab === 'roles') setIsRoleModalOpen(true);
              else setIsBranchModalOpen(true);
            }}
            className="btn-primary flex items-center space-x-2 px-8 py-3 rounded-full shadow-lg shadow-brand-accent/20"
          >
            <Plus size={20} />
            <span>Add {activeTab === 'users' ? 'User' : activeTab === 'roles' ? 'Role' : 'Branch'}</span>
          </button>
        </div>
      </div>

      {activeTab === 'users' ? (
        <div className="bg-brand-surface rounded-3xl border border-brand-border overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead>
              <tr className="bg-brand-bg/50 border-bottom border-brand-border">
                <th className="px-6 py-4 text-xs font-bold text-brand-muted uppercase tracking-wider">Name</th>
                <th className="px-6 py-4 text-xs font-bold text-brand-muted uppercase tracking-wider">Username</th>
                <th className="px-6 py-4 text-xs font-bold text-brand-muted uppercase tracking-wider">Role</th>
                <th className="px-6 py-4 text-xs font-bold text-brand-muted uppercase tracking-wider">Branch</th>
                <th className="px-6 py-4 text-xs font-bold text-brand-muted uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-brand-muted uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {users.map(user => (
                <tr 
                  key={user.id} 
                  className="hover:bg-brand-bg/30 transition-colors cursor-pointer"
                  onClick={() => handleEditUser(user)}
                >
                  <td className="px-6 py-4 font-bold text-brand-text">{user.name}</td>
                  <td className="px-6 py-4 text-brand-muted">{user.username}</td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 bg-brand-accent/10 text-brand-accent rounded-full text-xs font-bold">
                      {user.roleName || user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-brand-muted text-sm">{user.branchName || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`flex items-center space-x-1 ${user.active ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {user.active ? <Check size={16} /> : <X size={16} />}
                      <span className="text-sm font-medium">{user.active ? 'Active' : 'Inactive'}</span>
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditUser(user);
                        }}
                        className="p-2 text-brand-muted hover:text-brand-accent transition-colors"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (user.role === 'store owner') {
                            showNotification('error', 'Store owner accounts cannot be deleted.');
                            return;
                          }
                          handleDeleteUser(user.id);
                        }}
                        className={`p-2 transition-colors ${user.role === 'store owner' ? 'text-brand-muted cursor-not-allowed opacity-50' : 'text-brand-muted hover:text-rose-500'}`}
                        disabled={user.role === 'store owner'}
                        title={user.role === 'store owner' ? 'Store owner accounts cannot be deleted' : 'Delete user'}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : activeTab === 'roles' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {roles.map(role => (
            <div 
              key={role.id} 
              className="bg-brand-surface rounded-3xl border border-brand-border p-6 space-y-4 cursor-pointer hover:border-brand-accent/50 transition-all"
              onClick={() => handleEditRole(role)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-brand-accent/10 rounded-xl flex items-center justify-center text-brand-accent">
                    <Shield size={20} />
                  </div>
                  <h3 className="font-bold text-brand-text text-lg">{role.name}</h3>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditRole(role);
                  }}
                  className="p-2 text-brand-muted hover:text-brand-accent transition-colors"
                >
                  <Edit2 size={18} />
                </button>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-brand-muted uppercase tracking-wider">Permissions</p>
                <div className="flex flex-wrap gap-2">
                  {role.permissions.map(perm => (
                    <span key={perm} className="px-2 py-1 bg-brand-bg text-brand-muted rounded-lg text-[10px] font-bold uppercase tracking-wider">
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {branches.map(branch => (
            <div 
              key={branch.id} 
              className="bg-brand-surface rounded-3xl border border-brand-border p-6 space-y-4 cursor-pointer hover:border-brand-accent/50 transition-all"
              onClick={() => handleEditBranch(branch)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-brand-accent/10 rounded-xl flex items-center justify-center text-brand-accent">
                    <Shield size={20} />
                  </div>
                  <h3 className="font-bold text-brand-text text-lg">{branch.name}</h3>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditBranch(branch);
                  }}
                  className="p-2 text-brand-muted hover:text-brand-accent transition-colors"
                >
                  <Edit2 size={18} />
                </button>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-brand-muted uppercase tracking-wider">Details</p>
                <div className="text-sm text-brand-muted">
                  <p>{branch.location || 'No location'}</p>
                  <p>{branch.phone || 'No phone'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* User Modal */}
      {isUserModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 z-50 pt-10 overflow-y-auto">
          <div className="bg-brand-surface rounded-3xl w-full max-w-md border border-brand-border shadow-2xl overflow-hidden mb-10">
            <div className="p-6 border-b border-brand-border flex items-center justify-between">
              <h2 className="text-xl font-bold text-brand-text flex items-center space-x-2">
                <UserPlus className="text-brand-accent" />
                <span>{editingUser ? 'Edit User' : 'Add New User'}</span>
              </h2>
              <button onClick={() => { setIsUserModalOpen(false); resetUserForm(); }} className="p-2 text-brand-muted hover:text-brand-text">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-2">Full Name</label>
                <input type="text" value={userName} onChange={e => setUserName(e.target.value)} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-2">Username</label>
                <input type="text" value={userUsername} onChange={e => setUserUsername(e.target.value.toLowerCase())} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-2">Password {editingUser && '(Leave blank to keep current)'}</label>
                <input type="password" value={userPassword} onChange={e => setUserPassword(e.target.value)} className="input-field" required={!editingUser} />
              </div>
              <div>
                <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-2">Assigned Branch</label>
                <select 
                  value={userBranchId} 
                  onChange={e => {
                    if (e.target.value === 'add_new') {
                      setIsBranchModalOpen(true);
                      setUserBranchId('');
                    } else {
                      setUserBranchId(e.target.value);
                    }
                  }} 
                  className="input-field"
                >
                  <option value="">Current Store (Main)</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  <option value="add_new" className="font-bold text-brand-accent">+ Add New Branch</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-2">Role</label>
                <select value={userRoleId} onChange={e => setUserRoleId(e.target.value)} className="input-field" required>
                  <option value="">Select a role</option>
                  {roles.filter(r => r.name !== 'store owner').map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <button type="submit" className="btn-primary w-full py-3">Save User</button>
            </form>
          </div>
        </div>
      )}

      {/* Role Modal */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 z-50 pt-10 overflow-y-auto">
          <div className="bg-brand-surface rounded-3xl w-full max-w-lg border border-brand-border shadow-2xl overflow-hidden mb-10">
            <div className="p-6 border-b border-brand-border flex items-center justify-between">
              <h2 className="text-xl font-bold text-brand-text flex items-center space-x-2">
                <ShieldCheck className="text-brand-accent" />
                <span>{editingRole ? 'Edit Role' : 'Add New Role'}</span>
              </h2>
              <button onClick={() => { setIsRoleModalOpen(false); resetRoleForm(); }} className="p-2 text-brand-muted hover:text-brand-text">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSaveRole} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-2">Role Name</label>
                <input type="text" value={roleName} onChange={e => setRoleName(e.target.value)} className="input-field" placeholder="e.g. Supervisor" required />
              </div>
              <div className="space-y-3">
                <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider">Permissions</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {availablePermissions.map(perm => (
                    <button
                      key={perm.id}
                      type="button"
                      onClick={() => togglePermission(perm.id)}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        rolePermissions.includes(perm.id)
                          ? 'bg-brand-accent/10 border-brand-accent text-brand-accent'
                          : 'bg-brand-bg border-brand-border text-brand-muted hover:border-brand-accent/50'
                      }`}
                    >
                      <span className="text-sm font-bold">{perm.name}</span>
                      {rolePermissions.includes(perm.id) && <Check size={16} />}
                    </button>
                  ))}
                </div>
              </div>
              <button type="submit" className="btn-primary w-full py-3 sticky bottom-0 shadow-lg">Save Role</button>
            </form>
          </div>
        </div>
      )}

      {/* Branch Modal */}
      {isBranchModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 z-50 pt-10 overflow-y-auto">
          <div className="bg-brand-surface rounded-3xl w-full max-w-md border border-brand-border shadow-2xl overflow-hidden flex flex-col mb-10">
            <div className="p-6 border-b border-brand-border flex items-center justify-between shrink-0">
              <h2 className="text-xl font-bold text-brand-text flex items-center space-x-2">
                <ShieldCheck className="text-brand-accent" />
                <span>{editingBranch ? 'Edit Branch' : 'Add New Branch'}</span>
              </h2>
              <button onClick={() => { setIsBranchModalOpen(false); resetBranchForm(); }} className="p-2 text-brand-muted hover:text-brand-text">
                <X size={24} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <form onSubmit={handleSaveBranch} className="p-6 space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-2">Branch Name</label>
                    <input type="text" value={branchName} onChange={e => setBranchName(e.target.value)} className="input-field" placeholder="e.g. Main Branch" required />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-2">Location</label>
                    <textarea 
                      value={branchLocation} 
                      onChange={e => setBranchLocation(e.target.value)} 
                      className="input-field min-h-[100px] py-3" 
                      placeholder="Enter full address..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-brand-muted uppercase tracking-wider mb-2">Phone Number</label>
                    <input type="text" value={branchPhone} onChange={e => setBranchPhone(e.target.value)} className="input-field" placeholder="e.g. 08012345678" />
                  </div>
                </div>
                <div className="pt-4">
                  <button type="submit" className="btn-primary w-full py-4 rounded-2xl shadow-lg shadow-brand-accent/20 font-bold tracking-wide">
                    {editingBranch ? 'Update Branch' : 'Save Branch'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
