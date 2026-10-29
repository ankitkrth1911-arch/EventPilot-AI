import React, { useState } from 'react';
import { EventItem, VendorItem } from '../../types/event';
import { formatCurrency } from '../../utils/eventCalculations';
import { Plus, Phone, Mail, FileText, CheckCircle2, Clock, Trash2, Building } from 'lucide-react';

interface VendorsTabProps {
  event: EventItem;
  onUpdateEvent: (updated: EventItem) => void;
}

export const VendorsTab: React.FC<VendorsTabProps> = ({ event, onUpdateEvent }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newVendor, setNewVendor] = useState({
    name: '',
    service: 'Catering',
    contactPerson: '',
    phone: '',
    email: '',
    fee: 1500,
    status: 'booked' as VendorItem['status'],
    notes: '',
  });

  const handleDeleteVendor = (id: string) => {
    const updated = event.vendors.filter((v) => v.id !== id);
    onUpdateEvent({ ...event, vendors: updated });
  };

  const handleAddVendor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVendor.name.trim()) return;

    const vendor: VendorItem = {
      id: crypto.randomUUID(),
      name: newVendor.name.trim(),
      service: newVendor.service.trim(),
      contactPerson: newVendor.contactPerson.trim(),
      phone: newVendor.phone.trim(),
      email: newVendor.email.trim(),
      fee: Number(newVendor.fee) || 0,
      status: newVendor.status,
      notes: newVendor.notes.trim() || undefined,
    };

    onUpdateEvent({
      ...event,
      vendors: [...event.vendors, vendor],
    });

    setShowAddModal(false);
    setNewVendor({
      name: '',
      service: 'Catering',
      contactPerson: '',
      phone: '',
      email: '',
      fee: 1500,
      status: 'booked',
      notes: '',
    });
  };

  const statusBadge = {
    confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    booked: 'bg-blue-50 text-blue-700 border-blue-200',
    contacted: 'bg-amber-50 text-amber-700 border-amber-200',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#111827]">
            Vendors & Production Partners
          </h2>
          <p className="text-xs text-[#4B5563]">
            Direct contact lines, load-in instructions, and fee commitments
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 h-11 rounded-[12px] bg-[#4B2FC9] hover:bg-[#3C24A4] active:scale-[0.98] text-white text-xs font-semibold shadow-sm transition-all cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Add Vendor</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {event.vendors.map((vendor) => (
          <div
            key={vendor.id}
            className="bg-white rounded-[16px] border border-[#E5E7EB] p-5 shadow-surface-card hover:shadow-surface-hover transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#EDE9FE] text-[#4B2FC9]">
                  {vendor.service}
                </span>

                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                    statusBadge[vendor.status]
                  }`}
                >
                  {vendor.status}
                </span>
              </div>

              <h3 className="text-base font-bold text-[#111827] mb-1 group-hover:text-[#4B2FC9] transition-colors">
                {vendor.name}
              </h3>

              {vendor.contactPerson && (
                <p className="text-xs text-[#4B5563] mb-3">
                  Lead Contact: <strong className="text-[#111827]">{vendor.contactPerson}</strong>
                </p>
              )}

              <div className="space-y-1.5 text-xs text-[#4B5563] mb-4">
                {vendor.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-[#9CA3AF]" />
                    <a
                      href={`tel:${vendor.phone}`}
                      className="hover:text-[#4B2FC9] transition-colors"
                    >
                      {vendor.phone}
                    </a>
                  </div>
                )}
                {vendor.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-[#9CA3AF]" />
                    <a
                      href={`mailto:${vendor.email}`}
                      className="hover:text-[#4B2FC9] transition-colors truncate"
                    >
                      {vendor.email}
                    </a>
                  </div>
                )}
              </div>

              {vendor.notes && (
                <div className="p-2.5 rounded-[10px] bg-[#F4F5FA] border border-[#E5E7EB] text-xs text-[#4B5563] mb-4">
                  <div className="flex items-center gap-1 font-semibold text-[#111827] mb-0.5">
                    <FileText className="w-3 h-3 text-[#4B2FC9]" />
                    <span>Instructions:</span>
                  </div>
                  {vendor.notes}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[#E5E7EB] flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] uppercase text-[#9CA3AF] font-semibold tracking-wider block">
                  Contract Fee
                </span>
                <span className="text-sm font-bold text-[#111827]">
                  {formatCurrency(vendor.fee, event.currency)}
                </span>
              </div>

              <button
                onClick={() => handleDeleteVendor(vendor.id)}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-rose-600 rounded-md transition-colors cursor-pointer"
                title="Remove vendor"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Vendor Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-[16px] border border-[#E5E7EB] shadow-surface-modal w-full max-w-lg p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-[#111827] mb-1">Add Vendor</h3>
            <p className="text-xs text-[#4B5563] mb-4">
              Keep production partners, contracts, and contacts synced in one place.
            </p>

            <form onSubmit={handleAddVendor} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">
                  Vendor / Business Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Monterey Groove Band"
                  value={newVendor.name}
                  onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })}
                  className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    Service Category
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Venue, Catering, Florals, DJ..."
                    value={newVendor.service}
                    onChange={(e) => setNewVendor({ ...newVendor, service: e.target.value })}
                    className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    Primary Contact Person
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ray Golden"
                    value={newVendor.contactPerson}
                    onChange={(e) =>
                      setNewVendor({ ...newVendor, contactPerson: e.target.value })
                    }
                    className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="+1 (555) 123-4567"
                    value={newVendor.phone}
                    onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })}
                    className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="contact@vendor.com"
                    value={newVendor.email}
                    onChange={(e) => setNewVendor({ ...newVendor, email: e.target.value })}
                    className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    Agreed Fee ({event.currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newVendor.fee}
                    onChange={(e) =>
                      setNewVendor({ ...newVendor, fee: Number(e.target.value) })
                    }
                    className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    Status
                  </label>
                  <select
                    value={newVendor.status}
                    onChange={(e) =>
                      setNewVendor({
                        ...newVendor,
                        status: e.target.value as VendorItem['status'],
                      })
                    }
                    className="w-full h-11 px-3 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  >
                    <option value="confirmed">Confirmed</option>
                    <option value="booked">Booked</option>
                    <option value="contacted">Contacted</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">
                  Load-in Logistics & Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Gate codes, setup window, power outlet needs..."
                  value={newVendor.notes}
                  onChange={(e) => setNewVendor({ ...newVendor, notes: e.target.value })}
                  className="w-full p-3 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 h-11 rounded-[12px] bg-white border border-[#E5E7EB] text-sm font-semibold text-[#111827] hover:bg-[#F9FAFB] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 h-11 rounded-[12px] bg-[#4B2FC9] hover:bg-[#3C24A4] text-sm font-semibold text-white shadow-sm cursor-pointer"
                >
                  Save Vendor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
