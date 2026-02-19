import React, { useState } from 'react';
import axios from 'axios';
import { Download, Plus, Trash2, FileText, CheckCircle } from 'lucide-react';

const CO_OPTIONS = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'];
const BTL_OPTIONS = ['L1', 'L2', 'L3', 'L4'];

function App() {
    const [header, setHeader] = useState({
        academicYear: '2025 – 26',
        ciaType: '1',
        courseCode: '',
        courseTitle: '',
        programme: '',
        semester: 'Fourth',
        date: '',
        session: 'FN',
        commonTo: '',
        permittingNotes: '',
    });

    const [partA, setPartA] = useState(
        Array(6).fill(0).map((_, i) => ({
            qNo: `${i + 1}`,
            text: '',
            co: 'CO1',
            btl: 'L1',
        }))
    );

    const [partB, setPartB] = useState(
        [7, 8, 9].map(qNo => ({
            qNo: `${qNo}`,
            a: { text: '', co: 'CO1', btl: 'L1' },
            b: { text: '', co: 'CO1', btl: 'L1' },
        }))
    );

    const [loading, setLoading] = useState(false);
    const [pdfUrl, setPdfUrl] = useState('');

    const handleHeaderChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setHeader({ ...header, [e.target.name]: e.target.value });
    };

    const handlePartAChange = (index: number, field: string, value: string) => {
        const newPartA = [...partA];
        newPartA[index] = { ...newPartA[index], [field]: value };
        setPartA(newPartA);
    };

    const handlePartBChange = (index: number, sub: 'a' | 'b', field: string, value: string) => {
        const newPartB = [...partB];
        const target = sub === 'a' ? newPartB[index].a : newPartB[index].b;
        const updatedSub = { ...target, [field]: value };
        newPartB[index] = { ...newPartB[index], [sub]: updatedSub };
        setPartB(newPartB);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const response = await axios.post('http://172.27.53.175:5000/api/papers', {
                header,
                partA,
                partB,
            });
            setPdfUrl(`http://172.27.53.175:5000${response.data.pdfUrl}`);
        } catch (error: any) {
            console.error('Error generating paper:', error);
            const msg = error.response?.data?.error || error.message || 'Failed to generate paper';
            alert(`Error: ${msg}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white shadow-xl rounded-lg overflow-hidden">
                    <div className="bg-blue-600 py-6 px-8 flex justify-between items-center">
                        <h1 className="text-2xl font-bold text-white flex items-center">
                            <FileText className="mr-2" /> CIA Question Paper Generator
                        </h1>
                        {pdfUrl && (
                            <a
                                href={pdfUrl}
                                download
                                className="flex items-center bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md font-medium transition"
                            >
                                <Download className="mr-2 h-5 w-5" /> Download PDF
                            </a>
                        )}
                    </div>

                    <form onSubmit={handleSubmit} className="p-8 space-y-8">
                        <section className="space-y-4">
                            <h2 className="text-lg font-semibold text-gray-800 border-b pb-2">Header Information</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Academic Year</label>
                                    <input type="text" name="academicYear" value={header.academicYear} onChange={handleHeaderChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border p-2" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">CIA Type</label>
                                    <select name="ciaType" value={header.ciaType} onChange={handleHeaderChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border p-2">
                                        <option value="1">CIA 1</option>
                                        <option value="2">CIA 2</option>
                                        <option value="3">CIA 3</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Course Code</label>
                                    <input type="text" name="courseCode" value={header.courseCode} onChange={handleHeaderChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border p-2" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Course Title</label>
                                    <input type="text" name="courseTitle" value={header.courseTitle} onChange={handleHeaderChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border p-2" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Programme / Branch</label>
                                    <input type="text" name="programme" value={header.programme} onChange={handleHeaderChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border p-2" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Semester</label>
                                    <input type="text" name="semester" value={header.semester} onChange={handleHeaderChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border p-2" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Date</label>
                                    <input type="date" name="date" value={header.date} onChange={handleHeaderChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border p-2" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Session</label>
                                    <select name="session" value={header.session} onChange={handleHeaderChange} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border p-2">
                                        <option value="FN">FN</option>
                                        <option value="AN">AN</option>
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700">Common To (Optional)</label>
                                    <input type="text" name="commonTo" value={header.commonTo} onChange={handleHeaderChange} placeholder="e.g. B.Tech IT" className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border p-2" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700">Permitting Notes (Optional)</label>
                                    <textarea name="permittingNotes" value={header.permittingNotes} onChange={handleHeaderChange as any} placeholder="e.g. Use of PSG Design Data Book is permitted" rows={2} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border p-2" />
                                </div>
                            </div>
                        </section>

                        <section className="space-y-4">
                            <h2 className="text-lg font-semibold text-gray-800 border-b pb-2">PART A (6 × 2 Marks)</h2>
                            <div className="space-y-4">
                                {partA.map((q, i) => (
                                    <div key={i} className="grid grid-cols-12 gap-3 items-end bg-gray-50 p-3 rounded-md border border-gray-200">
                                        <div className="col-span-1 text-center font-bold text-gray-500 pb-2">Q{i + 1}</div>
                                        <div className="col-span-11 md:col-span-7">
                                            <label className="block text-xs text-gray-500 mb-1">Question Text</label>
                                            <textarea value={q.text} onChange={(e) => handlePartAChange(i, 'text', e.target.value)} rows={2} className="block w-full border-gray-300 rounded-md shadow-sm sm:text-sm border p-2" required />
                                        </div>
                                        <div className="col-span-6 md:col-span-2">
                                            <label className="block text-xs text-gray-500 mb-1">CO</label>
                                            <select value={q.co} onChange={(e) => handlePartAChange(i, 'co', e.target.value)} className="block w-full border-gray-300 rounded-md shadow-sm sm:text-sm border p-2">
                                                {CO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        </div>
                                        <div className="col-span-6 md:col-span-2">
                                            <label className="block text-xs text-gray-500 mb-1">BTL</label>
                                            <select value={q.btl} onChange={(e) => handlePartAChange(i, 'btl', e.target.value)} className="block w-full border-gray-300 rounded-md shadow-sm sm:text-sm border p-2">
                                                {BTL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="space-y-4">
                            <h2 className="text-lg font-semibold text-gray-800 border-b pb-2">PART B (3 × 16 Marks – Either/Or)</h2>
                            <div className="space-y-6">
                                {partB.map((group, i) => (
                                    <div key={i} className="space-y-3 p-4 bg-blue-50/30 rounded-lg border border-blue-100">
                                        <h3 className="font-bold text-blue-800">Question {group.qNo} (Either or)</h3>
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-12 gap-3 items-end">
                                                <div className="col-span-1 font-semibold text-gray-600 pb-2">(a)</div>
                                                <div className="col-span-11 md:col-span-7">
                                                    <textarea placeholder="Question Text" value={group.a.text} onChange={(e) => handlePartBChange(i, 'a', 'text', e.target.value)} rows={2} className="block w-full border-gray-300 rounded-md shadow-sm sm:text-sm border p-2" required />
                                                </div>
                                                <div className="col-span-6 md:col-span-2">
                                                    <select value={group.a.co} onChange={(e) => handlePartBChange(i, 'a', 'co', e.target.value)} className="block w-full border-gray-300 rounded-md shadow-sm sm:text-sm border p-2">
                                                        {CO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                    </select>
                                                </div>
                                                <div className="col-span-6 md:col-span-2">
                                                    <select value={group.a.btl} onChange={(e) => handlePartBChange(i, 'a', 'btl', e.target.value)} className="block w-full border-gray-300 rounded-md shadow-sm sm:text-sm border p-2">
                                                        {BTL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="text-center text-xs font-bold text-gray-400">--- OR ---</div>
                                            <div className="grid grid-cols-12 gap-3 items-end">
                                                <div className="col-span-1 font-semibold text-gray-600 pb-2">(b)</div>
                                                <div className="col-span-11 md:col-span-7">
                                                    <textarea placeholder="Question Text" value={group.b.text} onChange={(e) => handlePartBChange(i, 'b', 'text', e.target.value)} rows={2} className="block w-full border-gray-300 rounded-md shadow-sm sm:text-sm border p-2" required />
                                                </div>
                                                <div className="col-span-6 md:col-span-2">
                                                    <select value={group.b.co} onChange={(e) => handlePartBChange(i, 'b', 'co', e.target.value)} className="block w-full border-gray-300 rounded-md shadow-sm sm:text-sm border p-2">
                                                        {CO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                    </select>
                                                </div>
                                                <div className="col-span-6 md:col-span-2">
                                                    <select value={group.b.btl} onChange={(e) => handlePartBChange(i, 'b', 'btl', e.target.value)} className="block w-full border-gray-300 rounded-md shadow-sm sm:text-sm border p-2">
                                                        {BTL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <div className="pt-6">
                            <button
                                type="submit"
                                disabled={loading}
                                className={`w-full py-4 px-6 rounded-lg text-white font-bold text-lg shadow-lg transition transform active:scale-95 ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                            >
                                {loading ? 'Generating Paper...' : 'Generate CIA Question Paper'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default App;
