import React, { useState, useEffect } from 'react';
import { query, run, persistDB } from '../lib/db';
import { useSettings } from '../context/SettingsContext';
import { useNotification } from '../context/NotificationContext';
import { 
  Users, 
  Plus, 
  Search, 
  DollarSign, 
  Calendar as CalendarIcon, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  MoreVertical, 
  Trash2, 
  Edit2, 
  ChevronRight, 
  Download, 
  Banknote, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight,
  Filter,
  UserPlus,
  Upload,
  FileDown,
  FileUp
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { saveFile } from '../utils/fileSaver';
import { motion, AnimatePresence } from 'motion/react';
import { v4 as uuidv4 } from 'uuid';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import CurrencyInput from './CurrencyInput';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Employee {
  id: string;
  name: string;
  role: string;
  salary: number;
  bankName: string;
  accountNumber: string;
  accountName: string;
  phoneNumber: string;
  email: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

interface PayrollRecord {
  id: string;
  employeeId: string;
  employeeName?: string;
  month: string;
  baseSalary: number;
  bonuses: number;
  deductions: number;
  netSalary: number;
  status: 'paid' | 'unpaid';
  paymentDate?: string;
  paymentMethod?: string;
  notes?: string;
  createdAt: string;
}

export default function Payroll({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const { settings, playSound } = useSettings();
  const { showNotification } = useNotification();
  const [activeTab, setActiveTab] = useState<'employees' | 'payroll'>('employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [search, setSearch] = useState('');
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [showPayrollModal, setShowPayrollModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const downloadSampleCSV = async () => {
    try {
      const headers = ['name', 'role', 'salary', 'bankName', 'accountNumber', 'accountName', 'phoneNumber', 'email'];
      const sampleData = [
        ['John Doe', 'Manager', '5000', 'First Bank', '1234567890', 'John Doe', '08012345678', 'john@example.com'],
        ['Jane Smith', 'Cashier', '3000', 'GTBank', '0987654321', 'Jane Smith', '08087654321', 'jane@example.com']
      ];
      
      const csvContent = [
        headers.join(','),
        ...sampleData.map(row => row.join(','))
      ].join('\n');
      
      await saveFile('employees_sample.csv', csvContent, 'text/csv');
      showNotification('success', 'Sample CSV downloaded');
    } catch (error) {
      console.error('Download error:', error);
      showNotification('error', 'Failed to download sample CSV');
    }
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        
        const employeesToUpload = lines.slice(1).filter(line => line.trim()).map(line => {
          const values = line.split(',').map(v => v.trim());
          const emp: any = {};
          headers.forEach((header, index) => {
            const val = values[index];
            if (val !== undefined && val !== '') {
              emp[header] = val;
            }
          });
          return emp;
        });

        if (employeesToUpload.length === 0) {
          showNotification('error', 'No employees found in CSV');
          return;
        }

        const response = await apiFetch('/api/employees/bulk', {
          method: 'POST',
          body: JSON.stringify({ employees: employeesToUpload })
        });

        const data = await response.json();

        if (data.success) {
          showNotification('success', `Successfully processed ${employeesToUpload.length} employees`);
          fetchEmployees();
          playSound('success');
        } else {
          showNotification('error', data.error || 'Failed to upload employees');
        }
      } catch (error) {
        console.error('CSV Upload Error:', error);
        showNotification('error', 'Error parsing CSV file');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  // Form states
  const [employeeForm, setEmployeeForm] = useState({
    name: '',
    role: '',
    salary: '',
    bankName: '',
    accountNumber: '',
    accountName: '',
    phoneNumber: '',
    email: ''
  });

  const [payrollForm, setPayrollForm] = useState({
    employeeId: '',
    month: new Date().toISOString().slice(0, 7),
    bonuses: '0',
    deductions: '0',
    notes: '',
    paymentMethod: 'Transfer'
  });

  const [isAddingNewEmployeeFromPayroll, setIsAddingNewEmployeeFromPayroll] = useState(false);
  const [storeStaff, setStoreStaff] = useState<{id: string, name: string, role: string}[]>([]);

  useEffect(() => {
    fetchEmployees();
    fetchPayroll();
    fetchStoreStaff();
  }, []);

  const fetchStoreStaff = () => {
    try {
      const data = query("SELECT id, name, role FROM users WHERE active = 1");
      setStoreStaff(data as {id: string, name: string, role: string}[]);
    } catch (error) {
      console.error('Failed to fetch store staff:', error);
    }
  };

  const fetchEmployees = () => {
    try {
      const data = query("SELECT * FROM employees ORDER BY name ASC");
      setEmployees(data as Employee[]);
    } catch (error) {
      console.error('Failed to fetch employees:', error);
    }
  };

  const fetchPayroll = () => {
    try {
      const data = query(`
        SELECT p.*, e.name as employeeName 
        FROM payroll p 
        JOIN employees e ON p.employeeId = e.id 
        ORDER BY p.month DESC, e.name ASC
      `);
      setPayrollRecords(data as PayrollRecord[]);
    } catch (error) {
      console.error('Failed to fetch payroll:', error);
    }
  };

  const handleSaveEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingEmployee) {
        run(`
          UPDATE employees SET 
          name = ?, role = ?, salary = ?, bankName = ?, 
          accountNumber = ?, accountName = ?, phoneNumber = ?, email = ?
          WHERE id = ?
        `, [
          employeeForm.name, employeeForm.role, parseFloat(employeeForm.salary), 
          employeeForm.bankName, employeeForm.accountNumber, employeeForm.accountName, 
          employeeForm.phoneNumber, employeeForm.email, editingEmployee.id
        ]);
        showNotification('success', 'Employee updated successfully');
      } else {
        run(`
          INSERT INTO employees (id, name, role, salary, bankName, accountNumber, accountName, phoneNumber, email)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          uuidv4(), employeeForm.name, employeeForm.role, parseFloat(employeeForm.salary), 
          employeeForm.bankName, employeeForm.accountNumber, employeeForm.accountName, 
          employeeForm.phoneNumber, employeeForm.email
        ]);
        showNotification('success', 'Employee added successfully');
      }
      fetchEmployees();
      setShowEmployeeModal(false);
      setEditingEmployee(null);
      resetEmployeeForm();
      playSound('success');
    } catch (error) {
      showNotification('error', 'Failed to save employee');
      playSound('alert');
    }
  };

  const handleGeneratePayroll = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (payrollForm.employeeId === 'add-new') {
        setShowPayrollModal(false);
        resetEmployeeForm();
        setEditingEmployee(null);
        setShowEmployeeModal(true);
        return;
      }

      const employee = employees.find(emp => emp.id === payrollForm.employeeId);
      if (!employee) return;

      const baseSalary = employee.salary;
      const bonuses = parseFloat(payrollForm.bonuses) || 0;
      const deductions = parseFloat(payrollForm.deductions) || 0;
      const netSalary = baseSalary + bonuses - deductions;

      run(`
        INSERT INTO payroll (id, employeeId, month, baseSalary, bonuses, deductions, netSalary, status, paymentMethod, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'unpaid', ?, ?)
      `, [
        uuidv4(), payrollForm.employeeId, payrollForm.month, baseSalary, bonuses, deductions, netSalary, payrollForm.paymentMethod, payrollForm.notes
      ]);

      fetchPayroll();
      setShowPayrollModal(false);
      showNotification('success', 'Payroll record generated');
      playSound('success');
    } catch (error) {
      showNotification('error', 'Failed to generate payroll');
      playSound('alert');
    }
  };

  const handleMarkAsPaid = (record: PayrollRecord) => {
    try {
      run(`
        UPDATE payroll SET status = 'paid', paymentDate = ? WHERE id = ?
      `, [new Date().toISOString(), record.id]);
      
      // Also record as an expense
      run(`
        INSERT INTO expenses (id, description, amount, category, date)
        VALUES (?, ?, ?, 'Salary', ?)
      `, [uuidv4(), `Salary Payment: ${record.employeeName} (${record.month})`, record.netSalary, new Date().toISOString().split('T')[0]]);

      fetchPayroll();
      showNotification('success', 'Payroll marked as paid');
      playSound('success');
    } catch (error) {
      showNotification('error', 'Failed to update payroll status');
      playSound('alert');
    }
  };

  const handleDeleteEmployee = (id: string) => {
    if (window.confirm('Are you sure you want to delete this employee? This will not delete their payroll history.')) {
      try {
        run("DELETE FROM employees WHERE id = ?", [id]);
        fetchEmployees();
        showNotification('success', 'Employee deleted');
      } catch (error) {
        showNotification('error', 'Failed to delete employee');
      }
    }
  };

  const handleDeletePayroll = (id: string) => {
    if (window.confirm('Are you sure you want to delete this payroll record?')) {
      try {
        run("DELETE FROM payroll WHERE id = ?", [id]);
        fetchPayroll();
        showNotification('success', 'Payroll record deleted');
      } catch (error) {
        showNotification('error', 'Failed to delete payroll record');
      }
    }
  };

  const resetEmployeeForm = () => {
    setEmployeeForm({
      name: '',
      role: '',
      salary: '',
      bankName: '',
      accountNumber: '',
      accountName: '',
      phoneNumber: '',
      email: ''
    });
  };

  const openEditEmployee = (employee: Employee) => {
    setEditingEmployee(employee);
    setEmployeeForm({
      name: employee.name,
      role: employee.role,
      salary: employee.salary.toString(),
      bankName: employee.bankName,
      accountNumber: employee.accountNumber,
      accountName: employee.accountName,
      phoneNumber: employee.phoneNumber,
      email: employee.email
    });
    setShowEmployeeModal(true);
  };

  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(search.toLowerCase()) ||
    emp.role.toLowerCase().includes(search.toLowerCase())
  );

  const filteredPayroll = payrollRecords.filter(rec => 
    (rec.employeeName?.toLowerCase().includes(search.toLowerCase()) ||
    rec.month.includes(search)) &&
    (selectedMonth ? rec.month === selectedMonth : true)
  );

  const totalPayroll = filteredPayroll.reduce((sum, rec) => sum + rec.netSalary, 0);
  const paidPayroll = filteredPayroll.filter(r => r.status === 'paid').reduce((sum, rec) => sum + rec.netSalary, 0);
  const unpaidPayroll = filteredPayroll.filter(r => r.status === 'unpaid').reduce((sum, rec) => sum + rec.netSalary, 0);

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-brand-text">Payroll Management</h2>
          <p className="text-sm text-brand-muted">Manage staff salaries, payments and records</p>
        </div>
        <div className="flex items-center gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleCSVUpload} 
            accept=".csv" 
            className="hidden" 
          />
          <div className="flex items-center gap-1 bg-brand-bg p-1 rounded-xl border border-brand-border">
            <button 
              onClick={downloadSampleCSV}
              className="p-2 text-brand-muted hover:text-brand-accent hover:bg-brand-surface rounded-lg transition-all flex items-center gap-2 text-xs font-bold"
              title="Download Sample CSV"
            >
              <FileDown size={16} />
              <span className="hidden sm:inline">Sample CSV</span>
            </button>
            <div className="w-px h-4 bg-brand-border mx-1" />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-brand-muted hover:text-brand-accent hover:bg-brand-surface rounded-lg transition-all flex items-center gap-2 text-xs font-bold"
              title="Upload CSV"
            >
              <Upload size={16} />
              <span className="hidden sm:inline">Upload CSV</span>
            </button>
          </div>
          <button 
            onClick={() => {
              resetEmployeeForm();
              setEditingEmployee(null);
              setShowEmployeeModal(true);
            }}
            className="btn-primary flex items-center gap-2 px-4 py-2.5"
          >
            <UserPlus size={18} />
            <span className="hidden sm:inline">Add Employee</span>
          </button>
          <button 
            onClick={() => setShowPayrollModal(true)}
            className="btn-secondary flex items-center gap-2 px-4 py-2.5"
          >
            <Banknote size={18} />
            <span className="hidden sm:inline">Generate Payroll</span>
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4 flex items-center gap-4 border-l-4 border-l-blue-500">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Total Payroll</p>
            <p className="text-xl font-bold text-brand-text">{settings.currencySymbol}{(totalPayroll || 0).toLocaleString()}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4 border-l-4 border-l-emerald-500">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Paid</p>
            <p className="text-xl font-bold text-brand-text">{settings.currencySymbol}{(paidPayroll || 0).toLocaleString()}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4 border-l-4 border-l-amber-500">
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Pending</p>
            <p className="text-xl font-bold text-brand-text">{settings.currencySymbol}{(unpaidPayroll || 0).toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex p-1 bg-brand-bg rounded-xl border border-brand-border w-fit">
          <button
            onClick={() => setActiveTab('employees')}
            className={cn(
              "px-6 py-2 text-sm font-bold rounded-lg transition-all",
              activeTab === 'employees' ? "bg-brand-surface text-brand-accent shadow-sm" : "text-brand-muted hover:text-brand-text"
            )}
          >
            Employees
          </button>
          <button
            onClick={() => setActiveTab('payroll')}
            className={cn(
              "px-6 py-2 text-sm font-bold rounded-lg transition-all",
              activeTab === 'payroll' ? "bg-brand-surface text-brand-accent shadow-sm" : "text-brand-muted hover:text-brand-text"
            )}
          >
            Payroll History
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'payroll' && (
            <input 
              type="month" 
              className="input-field py-2 text-sm w-40"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          )}
          <div className="relative w-full md:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
            <input 
              type="text" 
              placeholder="Search..." 
              className="input-field pl-9 py-2 text-sm w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="space-y-4">
        {activeTab === 'employees' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(filteredEmployees || []).map(emp => (
              <motion.div 
                layout
                key={emp.id}
                className="card p-5 group hover:border-brand-accent/30 transition-all cursor-pointer"
                onClick={() => openEditEmployee(emp)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-brand-bg flex items-center justify-center text-brand-accent font-bold text-xl">
                      {emp.name?.charAt(0) || 'E'}
                    </div>
                    <div>
                      <h4 className="font-bold text-brand-text">{emp.name}</h4>
                      <p className="text-xs text-brand-muted">{emp.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={(e) => { e.stopPropagation(); openEditEmployee(emp); }}
                      className="p-2 text-brand-muted hover:text-brand-accent hover:bg-brand-bg rounded-lg transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteEmployee(emp.id); }}
                      className="p-2 text-brand-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-brand-muted">Salary</span>
                    <span className="font-bold text-brand-text">{settings.currencySymbol}{(emp.salary || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-brand-muted">Bank</span>
                    <span className="text-brand-text">{emp.bankName || 'Not Set'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-brand-muted">Account</span>
                    <span className="text-brand-text font-mono text-xs">{emp.accountNumber || 'Not Set'}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-brand-border flex items-center justify-between">
                  <div className={cn(
                    "px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                    emp.status === 'active' ? "bg-emerald-50 text-emerald-600" : "bg-gray-50 text-gray-500"
                  )}>
                    {emp.status}
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setPayrollForm({ ...payrollForm, employeeId: emp.id });
                      setShowPayrollModal(true);
                    }}
                    className="text-xs font-bold text-brand-accent hover:underline flex items-center gap-1"
                  >
                    Pay Salary <ChevronRight size={14} />
                  </button>
                </div>
              </motion.div>
            ))}
            {filteredEmployees.length === 0 && (
              <div className="col-span-full py-20 text-center space-y-4">
                <div className="w-20 h-20 bg-brand-bg rounded-full flex items-center justify-center text-brand-muted mx-auto">
                  <Users size={40} />
                </div>
                <p className="text-brand-muted">No employees found. Add your first employee to get started.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-brand-bg/50 border-b border-brand-border">
                    <th className="px-6 py-4 col-header">Employee</th>
                    <th className="px-6 py-4 col-header">Month</th>
                    <th className="px-6 py-4 col-header">Net Salary</th>
                    <th className="px-6 py-4 col-header">Status</th>
                    <th className="px-6 py-4 col-header">Payment Date</th>
                    <th className="px-6 py-4 col-header text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/50">
                  {(filteredPayroll || []).map(rec => (
                    <tr key={rec.id} className="data-row">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-brand-bg flex items-center justify-center text-brand-accent font-bold text-xs">
                            {rec.employeeName?.charAt(0)}
                          </div>
                          <span className="font-bold text-brand-text">{rec.employeeName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-brand-text">
                        {new Date(rec.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-brand-text">{settings.currencySymbol}{(rec.netSalary || 0).toLocaleString()}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                          rec.status === 'paid' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                        )}>
                          {rec.status === 'paid' ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                          {rec.status}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-brand-muted">
                        {rec.paymentDate ? new Date(rec.paymentDate).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {rec.status === 'unpaid' && (
                            <button 
                              onClick={() => handleMarkAsPaid(rec)}
                              className="btn-primary py-1.5 px-3 text-xs"
                            >
                              Mark Paid
                            </button>
                          )}
                          <button 
                            onClick={() => handleDeletePayroll(rec.id)}
                            className="p-2 text-brand-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredPayroll.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-20 text-center text-brand-muted">
                        No payroll records found for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Employee Modal */}
      <AnimatePresence>
        {showEmployeeModal && (
          <div className="fixed inset-0 bg-brand-text/20 backdrop-blur-sm flex items-start justify-center z-[100] p-4 pt-20">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-brand-surface rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-brand-border"
            >
              <div className="p-6 border-b border-brand-border flex items-center justify-between bg-brand-bg/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-accent text-white flex items-center justify-center">
                    <UserPlus size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-brand-text">{editingEmployee ? 'Edit Employee' : 'Add New Employee'}</h3>
                    <p className="text-xs text-brand-muted">Enter staff details and salary information</p>
                  </div>
                </div>
                <button onClick={() => setShowEmployeeModal(false)} className="p-2 hover:bg-brand-bg rounded-xl transition-colors">
                  <XCircle size={24} className="text-brand-muted" />
                </button>
              </div>

              <form onSubmit={handleSaveEmployee} className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Full Name</label>
                    <input 
                      required
                      type="text"
                      className="input-field"
                      value={employeeForm.name}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Role / Position</label>
                    <input 
                      required
                      type="text"
                      className="input-field"
                      placeholder="e.g. Manager, Cashier"
                      value={employeeForm.role}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, role: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Monthly Salary ({settings.currencySymbol})</label>
                    <CurrencyInput
                      value={employeeForm.salary}
                      onChange={val => setEmployeeForm({ ...employeeForm, salary: val.toString() })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Phone Number</label>
                    <input 
                      type="text"
                      className="input-field"
                      value={employeeForm.phoneNumber}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, phoneNumber: e.target.value })}
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-brand-border">
                  <h4 className="text-sm font-bold text-brand-text mb-4">Bank Details (For Payments)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Bank Name</label>
                      <input 
                        type="text"
                        className="input-field"
                        value={employeeForm.bankName}
                        onChange={(e) => setEmployeeForm({ ...employeeForm, bankName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Account Number</label>
                      <input 
                        type="text"
                        className="input-field"
                        value={employeeForm.accountNumber}
                        onChange={(e) => setEmployeeForm({ ...employeeForm, accountNumber: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Account Name</label>
                      <input 
                        type="text"
                        className="input-field"
                        value={employeeForm.accountName}
                        onChange={(e) => setEmployeeForm({ ...employeeForm, accountName: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setShowEmployeeModal(false)}
                    className="btn-secondary px-6"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="btn-primary px-10"
                  >
                    {editingEmployee ? 'Update Employee' : 'Add Employee'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payroll Modal */}
      <AnimatePresence>
        {showPayrollModal && (
          <div className="fixed inset-0 bg-brand-text/20 backdrop-blur-sm flex items-start justify-center z-[100] p-4 pt-20">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-brand-surface rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-brand-border"
            >
              <div className="p-6 border-b border-brand-border flex items-center justify-between bg-brand-bg/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-accent text-white flex items-center justify-center">
                    <Banknote size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-brand-text">Generate Payroll</h3>
                    <p className="text-xs text-brand-muted">Create a payment record for staff</p>
                  </div>
                </div>
                <button onClick={() => setShowPayrollModal(false)} className="p-2 hover:bg-brand-bg rounded-xl transition-colors">
                  <XCircle size={24} className="text-brand-muted" />
                </button>
              </div>

              <form onSubmit={handleGeneratePayroll} className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Select Employee</label>
                  <select 
                    required
                    className="input-field"
                    value={payrollForm.employeeId}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'add-new') {
                        setShowPayrollModal(false);
                        resetEmployeeForm();
                        setEditingEmployee(null);
                        setShowEmployeeModal(true);
                      } else if (val.startsWith('staff-')) {
                        const staffId = val.replace('staff-', '');
                        const staff = storeStaff.find(s => s.id === staffId);
                        if (staff) {
                          setShowPayrollModal(false);
                          setEmployeeForm({
                            ...employeeForm,
                            name: staff.name,
                            role: staff.role
                          });
                          setEditingEmployee(null);
                          setShowEmployeeModal(true);
                        }
                      } else {
                        setPayrollForm({ ...payrollForm, employeeId: val });
                      }
                    }}
                  >
                    <option value="">Choose an employee...</option>
                    <optgroup label="Payroll Employees">
                      {(employees || []).map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name} ({settings.currencySymbol}{(emp.salary || 0).toLocaleString()})</option>
                      ))}
                    </optgroup>
                    {storeStaff.length > 0 && (
                      <optgroup label="Store Staff (Not in Payroll)">
                        {storeStaff.filter(staff => !employees.some(emp => emp.name === staff.name)).map(staff => (
                          <option key={staff.id} value={`staff-${staff.id}`}>
                            {staff.name} ({staff.role})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <option value="add-new" className="font-bold text-brand-accent">+ Add New Employee</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Month</label>
                    <input 
                      required
                      type="month"
                      className="input-field"
                      value={payrollForm.month}
                      onChange={(e) => setPayrollForm({ ...payrollForm, month: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Payment Method</label>
                    <select 
                      className="input-field"
                      value={payrollForm.paymentMethod}
                      onChange={(e) => setPayrollForm({ ...payrollForm, paymentMethod: e.target.value })}
                    >
                      <option value="Transfer">Transfer</option>
                      <option value="Cash">Cash</option>
                      <option value="Cheque">Cheque</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Bonuses (+)</label>
                    <CurrencyInput
                      value={payrollForm.bonuses}
                      onChange={val => setPayrollForm({ ...payrollForm, bonuses: val.toString() })}
                      prefix={settings.currencySymbol}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Deductions (-)</label>
                    <CurrencyInput
                      value={payrollForm.deductions}
                      onChange={val => setPayrollForm({ ...payrollForm, deductions: val.toString() })}
                      prefix={settings.currencySymbol}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Notes</label>
                  <textarea 
                    className="input-field min-h-[80px]"
                    placeholder="Any additional information..."
                    value={payrollForm.notes}
                    onChange={(e) => setPayrollForm({ ...payrollForm, notes: e.target.value })}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setShowPayrollModal(false)}
                    className="btn-secondary px-6"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="btn-primary px-10"
                  >
                    Generate
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
