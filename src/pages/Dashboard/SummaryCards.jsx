import React from 'react';
import { Users, Utensils, ChefHat, AlertCircle } from 'lucide-react';

function Card({ title, value, icon: Icon, color, trend }) {
  const palette = {
    blue:   { border: 'border-l-blue-500',    bg: 'bg-blue-50',    text: 'text-blue-600' },
    green:  { border: 'border-l-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-600' },
    orange: { border: 'border-l-orange-500',  bg: 'bg-orange-50',  text: 'text-orange-600' },
    red:    { border: 'border-l-red-500',     bg: 'bg-red-50',     text: 'text-red-600' },
  };
  const c = palette[color] ?? palette.blue;
  return (
    <div className={`bg-white rounded-xl shadow-sm border p-5 border-l-4 ${c.border} flex items-center justify-between`}>
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        {trend && <p className="text-xs text-gray-400 mt-1">{trend}</p>}
      </div>
      <div className={`p-3 rounded-full ${c.bg} ${c.text}`}>
        <Icon className="w-6 h-6" />
      </div>
    </div>
  );
}

/**
 * SummaryCards – pass patients & dietTypes arrays.
 * Import and render inside Dashboard/index.jsx whenever you want the metric strip back.
 *
 * Example:
 *   import SummaryCards from './SummaryCards.jsx';
 *   <SummaryCards patients={patients} dietTypes={dietTypes} />
 */
export default function SummaryCards({ patients = [], dietTypes = [] }) {
  const active      = patients.filter(p => p.status === 'Active').length;
  const activeDiets = patients.filter(p => p.status === 'Active' && p.dietTypeId).length;
  const pending     = patients.filter(p => p.status === 'Active' && !p.dietTypeId).length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      <Card title="Total Patients"     value={active}      icon={Users}       color="blue" />
      <Card title="Diet Plans Active"  value={activeDiets} icon={Utensils}    color="green" />
      <Card title="Meals Served Today" value="247"         icon={ChefHat}     color="orange" trend="+12% from yesterday" />
      <Card title="Pending Reviews"    value={pending}     icon={AlertCircle} color="red" />
    </div>
  );
}
