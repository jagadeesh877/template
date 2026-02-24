import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { Download, Plus, Trash2, FileText, X, Loader2, CheckCircle } from 'lucide-react';

const CO_OPTIONS = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'];
const BTL_OPTIONS_PART_A = ['L1', 'L2'];
const BTL_OPTIONS_PART_B = ['L2', 'L3', 'L4'];

interface Subdivision {
    label: string;
    text: string;
    marks: string;
    images: string[];
}

interface PartBQuestion {
    text: string;
    images: string[];
    subdivisions: Subdivision[];
    co: string;
    btl: string;
}

interface PartBGroup {
    qNo: string;
    a: PartBQuestion;
    b: PartBQuestion;
}

// ── Paste helper: reads image from clipboard, calls onImage with base64 data URL ──
const readImageFromClipboard = (e: React.ClipboardEvent, onImage: (src: string) => void) => {
    const items = e.clipboardData?.items;
    if (!items) return false;
    for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (!file) continue;
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (ev.target?.result) onImage(ev.target.result as string);
            };
            reader.readAsDataURL(file);
            return true; // consumed as image
        }
    }
    return false; // normal text paste
};

// ── Reusable image thumbnail strip ──
const ImageStrip = ({ images, onRemove }: { images: string[]; onRemove: (i: number) => void }) => {
    if (!images || images.length === 0) return null;
    return (
        <div className="flex flex-wrap gap-2 mt-2">
            {images.map((src, i) => (
                <div key={i} className="relative group inline-block">
                    <img src={src} alt="" className="max-h-32 max-w-full rounded border border-gray-200 object-contain block mx-auto" style={{ display: 'block' }} />
                    <button
                        type="button"
                        onClick={() => onRemove(i)}
                        className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition"
                        title="Remove image"
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>
            ))}
        </div>
    );
};

function makePartBQuestion(): PartBQuestion {
    return { text: '', images: [], subdivisions: [], co: 'CO1', btl: 'L2' };
}

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
            images: [] as string[],
            co: 'CO1',
            btl: 'L1',
        }))
    );

    const [partB, setPartB] = useState<PartBGroup[]>(
        [7, 8, 9].map(qNo => ({
            qNo: `${qNo}`,
            a: makePartBQuestion(),
            b: makePartBQuestion(),
        }))
    );

    const [loading, setLoading] = useState(false);
    const [pdfUrl, setPdfUrl] = useState('');
    const [wordUrl, setWordUrl] = useState('');

    const generateFileName = () => {
        const { courseCode, courseTitle, ciaType } = header;
        const base = `${courseCode}-${courseTitle}-CIA${ciaType}`.trim();
        return base.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, ' ');
    };

    const handleHeaderChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const sanitizedValue = e.target.name === 'permittingNotes' ? e.target.value.replace(/[\r\n]+/g, ' ') : e.target.value;
        setHeader({ ...header, [e.target.name]: sanitizedValue });
    };

    // ── Part A handlers ──
    const handlePartAChange = (index: number, field: string, value: string) => {
        const sanitizedValue = field === 'text' ? value.replace(/[\r\n]+/g, ' ') : value;
        const newPartA = [...partA];
        newPartA[index] = { ...newPartA[index], [field]: sanitizedValue };
        setPartA(newPartA);
    };

    const addPartAImage = (index: number, src: string) => {
        const newPartA = [...partA];
        newPartA[index] = { ...newPartA[index], images: [...newPartA[index].images, src] };
        setPartA(newPartA);
    };

    const removePartAImage = (index: number, imgIdx: number) => {
        const newPartA = [...partA];
        const imgs = [...newPartA[index].images];
        imgs.splice(imgIdx, 1);
        newPartA[index] = { ...newPartA[index], images: imgs };
        setPartA(newPartA);
    };

    // ── Part B handlers ──
    const handlePartBSubChange = (qIndex: number, sub: 'a' | 'b', field: string, value: string) => {
        const sanitizedValue = field === 'text' ? value.replace(/[\r\n]+/g, ' ') : value;
        const newPartB = [...partB];
        newPartB[qIndex][sub] = { ...newPartB[qIndex][sub], [field]: sanitizedValue };
        setPartB(newPartB);
    };

    const addPartBImage = (qIndex: number, sub: 'a' | 'b', src: string) => {
        const newPartB = [...partB];
        newPartB[qIndex][sub] = { ...newPartB[qIndex][sub], images: [...(newPartB[qIndex][sub].images || []), src] };
        setPartB(newPartB);
    };

    const removePartBImage = (qIndex: number, sub: 'a' | 'b', imgIdx: number) => {
        const newPartB = [...partB];
        const imgs = [...(newPartB[qIndex][sub].images || [])];
        imgs.splice(imgIdx, 1);
        newPartB[qIndex][sub] = { ...newPartB[qIndex][sub], images: imgs };
        setPartB(newPartB);
    };

    const handleAddSubdivision = (qIndex: number, sub: 'a' | 'b') => {
        const newPartB = [...partB];
        if (newPartB[qIndex][sub].subdivisions.length === 0) {
            newPartB[qIndex][sub].subdivisions.push({ label: 'i)', text: newPartB[qIndex][sub].text, marks: '8', images: [] });
            newPartB[qIndex][sub].text = '';
        } else {
            newPartB[qIndex][sub].subdivisions.push({ label: '', text: '', marks: '8', images: [] });
        }
        setPartB(newPartB);
    };

    const handleRemoveSubdivision = (qIndex: number, sub: 'a' | 'b', subIndex: number) => {
        const newPartB = [...partB];
        const subList = newPartB[qIndex][sub].subdivisions;
        if (subList.length === 1) {
            newPartB[qIndex][sub].text = subList[0].text;
            newPartB[qIndex][sub].subdivisions = [];
        } else {
            subList.splice(subIndex, 1);
        }
        setPartB(newPartB);
    };

    const handleSubdivisionChange = (qIndex: number, sub: 'a' | 'b', subIndex: number, field: string, value: string) => {
        const sanitizedValue = field === 'text' ? value.replace(/[\r\n]+/g, ' ') : value;
        const newPartB = [...partB];
        newPartB[qIndex][sub].subdivisions[subIndex] = {
            ...newPartB[qIndex][sub].subdivisions[subIndex],
            [field]: sanitizedValue
        };
        setPartB(newPartB);
    };

    const addSubdivisionImage = (qIndex: number, sub: 'a' | 'b', subIndex: number, src: string) => {
        const newPartB = [...partB];
        const sd = newPartB[qIndex][sub].subdivisions[subIndex];
        newPartB[qIndex][sub].subdivisions[subIndex] = { ...sd, images: [...(sd.images || []), src] };
        setPartB(newPartB);
    };

    const removeSubdivisionImage = (qIndex: number, sub: 'a' | 'b', subIndex: number, imgIdx: number) => {
        const newPartB = [...partB];
        const sd = newPartB[qIndex][sub].subdivisions[subIndex];
        const imgs = [...(sd.images || [])];
        imgs.splice(imgIdx, 1);
        newPartB[qIndex][sub].subdivisions[subIndex] = { ...sd, images: imgs };
        setPartB(newPartB);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setPdfUrl('');
        setWordUrl('');
        try {
            const backendUrl = `http://${window.location.hostname}:5000`;
            const response = await axios.post(`${backendUrl}/api/papers`, {
                header,
                partA,
                partB,
                fileName: generateFileName()
            });
            setPdfUrl(`${backendUrl}${response.data.pdfUrl}?t=${Date.now()}`);
            setWordUrl(`${backendUrl}${response.data.wordUrl}?t=${Date.now()}`);
        } catch (error: any) {
            console.error('Error generating paper:', error);
            const msg = error.response?.data?.error || error.message || 'Failed to generate paper';
            alert(`Error: ${msg}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadFile = async (url: string, filename: string) => {
        try {
            const response = await axios.get(url, { responseType: 'blob' });
            const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = blobUrl;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error('Error downloading file:', error);
            alert('Failed to download file.');
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 py-10 px-4 sm:px-6 lg:px-8 font-sans">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white shadow-2xl rounded-2xl overflow-hidden border border-indigo-50">
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 py-8 px-8 flex flex-col sm:flex-row justify-between items-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white opacity-10 rounded-full blur-2xl pointer-events-none"></div>
                        <h1 className="text-3xl font-extrabold text-white flex items-center relative z-10 tracking-tight">
                            <FileText className="mr-3 w-8 h-8" /> CIA Question Paper Generator
                        </h1>
                    </div>

                    <form onSubmit={handleSubmit} className="p-8 space-y-8">
                        {/* Header */}
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

                        {/* Part A */}
                        <section className="space-y-4">
                            <h2 className="text-lg font-semibold text-gray-800 border-b pb-2">PART A (6 × 2 Marks)</h2>
                            <div className="space-y-4">
                                {partA.map((q, i) => (
                                    <div key={i} className="grid grid-cols-12 gap-3 items-start bg-gray-50 p-3 rounded-md border border-gray-200">
                                        <div className="col-span-1 text-center font-bold text-gray-500 pt-6">Q{i + 1}</div>
                                        <div className="col-span-11 md:col-span-7">
                                            <label className="block text-xs text-gray-500 mb-1">
                                                Question Text <span className="text-blue-400 font-normal">(Ctrl+V to paste image)</span>
                                            </label>
                                            <textarea
                                                value={q.text}
                                                onChange={(e) => handlePartAChange(i, 'text', e.target.value)}
                                                onPaste={(e) => readImageFromClipboard(e, (src) => addPartAImage(i, src))}
                                                rows={2}
                                                className="block w-full border-gray-300 rounded-md shadow-sm sm:text-sm border p-2"
                                                required={q.images.length === 0}
                                            />
                                            <ImageStrip images={q.images} onRemove={(imgIdx) => removePartAImage(i, imgIdx)} />
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
                                                {BTL_OPTIONS_PART_A.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Part B */}
                        <section className="space-y-4">
                            <h2 className="text-lg font-semibold text-gray-800 border-b pb-2">PART B (3 × 16 Marks – Either/Or)</h2>
                            <div className="space-y-6">
                                {partB.map((group, i) => (
                                    <div key={i} className="space-y-4 p-5 bg-blue-50/20 rounded-xl border border-blue-100 shadow-sm">
                                        <div className="flex justify-between items-center mb-2">
                                            <h3 className="font-bold text-blue-900 text-lg">Question {group.qNo}</h3>
                                        </div>

                                        {(['a', 'b'] as const).map((sub) => (
                                            <div key={sub} className="space-y-3">
                                                <div className="flex justify-between items-end bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                                                    <div className="flex items-center space-x-2">
                                                        <span className="font-bold text-xl text-blue-800">({sub})</span>
                                                        <div className="flex space-x-2">
                                                            <div className="w-24">
                                                                <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">CO</label>
                                                                <select value={group[sub].co} onChange={(e) => handlePartBSubChange(i, sub, 'co', e.target.value)} className="block w-full border-gray-200 rounded-md text-xs border p-1.5 focus:ring-blue-500">
                                                                    {CO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                                </select>
                                                            </div>
                                                            <div className="w-20">
                                                                <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">BTL</label>
                                                                <select value={group[sub].btl} onChange={(e) => handlePartBSubChange(i, sub, 'btl', e.target.value)} className="block w-full border-gray-200 rounded-md text-xs border p-1.5 focus:ring-blue-500">
                                                                    {BTL_OPTIONS_PART_B.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                                </select>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button type="button" onClick={() => handleAddSubdivision(i, sub)} className="flex items-center text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition font-medium">
                                                        <Plus className="w-3 h-3 mr-1" /> Add Subdivision
                                                    </button>
                                                </div>

                                                <div className="space-y-2 pl-6">
                                                    {group[sub].subdivisions.length === 0 ? (
                                                        <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
                                                            <label className="block text-[10px] text-gray-400 mb-1 uppercase font-bold">
                                                                Question Content <span className="text-blue-400 normal-case font-normal">(Ctrl+V to paste image)</span>
                                                            </label>
                                                            <textarea
                                                                value={group[sub].text}
                                                                onChange={(e) => handlePartBSubChange(i, sub, 'text', e.target.value)}
                                                                onPaste={(e) => readImageFromClipboard(e, (src) => addPartBImage(i, sub, src))}
                                                                rows={3}
                                                                placeholder="Enter full question text here..."
                                                                className="w-full border-gray-200 rounded text-sm border p-2 focus:ring-blue-500"
                                                                required={group[sub].images.length === 0}
                                                            />
                                                            <ImageStrip images={group[sub].images || []} onRemove={(imgIdx) => removePartBImage(i, sub, imgIdx)} />
                                                        </div>
                                                    ) : (
                                                        group[sub].subdivisions.map((sd: any, sdIdx: number) => (
                                                            <div key={sdIdx} className="grid grid-cols-12 gap-2 items-start bg-white p-3 rounded-md border border-gray-100 shadow-sm group">
                                                                <div className="col-span-1">
                                                                    <label className="block text-[10px] text-gray-400 mb-1">Label</label>
                                                                    <input type="text" placeholder="i)" value={sd.label} onChange={(e) => handleSubdivisionChange(i, sub, sdIdx, 'label', e.target.value)} className="w-full border-gray-200 rounded text-sm border p-1.5 focus:ring-blue-500" />
                                                                </div>
                                                                <div className="col-span-8">
                                                                    <label className="block text-[10px] text-gray-400 mb-1">
                                                                        Content <span className="text-blue-400 font-normal">(Ctrl+V for image)</span>
                                                                    </label>
                                                                    <textarea
                                                                        value={sd.text}
                                                                        onChange={(e) => handleSubdivisionChange(i, sub, sdIdx, 'text', e.target.value)}
                                                                        onPaste={(e) => readImageFromClipboard(e, (src) => addSubdivisionImage(i, sub, sdIdx, src))}
                                                                        rows={2}
                                                                        className="w-full border-gray-200 rounded text-sm border p-1.5 focus:ring-blue-500"
                                                                    />
                                                                    <ImageStrip images={sd.images || []} onRemove={(imgIdx) => removeSubdivisionImage(i, sub, sdIdx, imgIdx)} />
                                                                </div>
                                                                <div className="col-span-2">
                                                                    <label className="block text-[10px] text-gray-400 mb-1">Marks</label>
                                                                    <select value={sd.marks} onChange={(e) => handleSubdivisionChange(i, sub, sdIdx, 'marks', e.target.value)} className="w-full border-gray-200 rounded text-sm border p-1.5 focus:ring-blue-500">
                                                                        {[16, 12, 10, 8, 6, 4].map(m => <option key={m} value={m}>{m}</option>)}
                                                                    </select>
                                                                </div>
                                                                <div className="col-span-1 pt-6 text-right">
                                                                    <button type="button" onClick={() => handleRemoveSubdivision(i, sub, sdIdx)} className="text-red-400 hover:text-red-600 transition p-1" title="Remove part">
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                                {sub === 'a' && <div className="text-center py-2"><span className="px-4 py-1 bg-gray-100 text-gray-400 text-xs font-bold rounded-full border border-gray-200 uppercase tracking-widest">OR</span></div>}
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </section>

                        <div className="pt-8">
                            <button
                                type="submit"
                                disabled={loading}
                                className={`w-full py-4 px-6 rounded-xl text-white font-bold text-lg shadow-xl transition-all duration-300 flex justify-center items-center gap-2 ${loading ? 'bg-indigo-400 cursor-wait' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:-translate-y-1 hover:shadow-indigo-500/30'}`}
                            >
                                {loading ? (
                                    <><Loader2 className="w-6 h-6 animate-spin" /> Generating Paper...</>
                                ) : (
                                    <><FileText className="w-6 h-6" /> Generate CIA Question Paper</>
                                )}
                            </button>
                        </div>

                        {/* Animated Pop-Out Download Section */}
                        {(pdfUrl || wordUrl) && !loading && (
                            <div className="mt-8 animate-pop-in bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl p-8 border border-indigo-100 shadow-inner flex flex-col items-center justify-center relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-indigo-500"></div>
                                <div className="bg-indigo-100 text-indigo-600 p-3 rounded-full mb-4 shadow-sm">
                                    <CheckCircle className="w-8 h-8" />
                                </div>
                                <h3 className="text-indigo-900 font-extrabold text-2xl mb-2">Success!</h3>
                                <p className="text-indigo-700/80 font-medium mb-6">Your CIA Question Paper is ready.</p>
                                <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                                    {pdfUrl && (
                                        <button type="button" onClick={() => handleDownloadFile(pdfUrl, `${generateFileName()}.pdf`)} className="flex items-center justify-center bg-white text-rose-600 border border-rose-200 hover:border-rose-400 hover:bg-rose-50 px-8 py-4 rounded-xl font-bold transition-all shadow-md hover:shadow-lg w-full sm:w-auto group">
                                            <Download className="mr-2 h-5 w-5 group-hover:-translate-y-1 transition-transform" /> Download PDF
                                        </button>
                                    )}
                                    {wordUrl && (
                                        <button type="button" onClick={() => handleDownloadFile(wordUrl, `${generateFileName()}.docx`)} className="flex items-center justify-center bg-white text-blue-600 border border-blue-200 hover:border-blue-400 hover:bg-blue-50 px-8 py-4 rounded-xl font-bold transition-all shadow-md hover:shadow-lg w-full sm:w-auto group">
                                            <Download className="mr-2 h-5 w-5 group-hover:-translate-y-1 transition-transform" /> Download Word
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </form>
                </div>
            </div>
        </div>
    );
}

export default App;
