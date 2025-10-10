"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';

// --- Type Definitions ---
type ArchivedEmployee = { system_id: number | null; fullname_en: string; empno: string; department: string; section: string; status_en: 'Active' | 'Inactive' | 'Disabled' | null; status_ar: string | null; warrant_status: string; card_status: string; card_expiry: string; card_status_class: string; };
type ApiEmployeeResponse = { employees: ArchivedEmployee[]; total_employees: number; };
type HrEmployee = { system_id: number; fullname_en: string; fullname_ar: string; empno: string; };
type ApiHrResponse = { employees: HrEmployee[]; hasMore: boolean; };
type HrEmployeeDetails = { [key: string]: any };
type Status = { system_id: number; name_english: string; name_arabic: string; };
type DocType = { system_id: number; name: string; };
type Legislation = { system_id: number; name: string; };
type DocumentTypesResponse = { all_types: DocType[]; types_with_expiry: DocType[]; };
type ExistingDocument = { system_id: number; docnumber: number; expiry: string | null; doc_type_id: number; legislation_ids: number[]; doc_name: string; legislation_names: string[] | null; };
type NewDocument = { doc_type_id: string; doc_type_name: string; file: File | null; expiry: string; legislation_ids: string[]; };


// --- Document Viewer Modal Component ---
const DocumentViewerModal = ({ docUrl, docName, onClose }: { docUrl: string; docName?: string; onClose: () => void; }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [contentUrl, setContentUrl] = useState('');
    const [isImage, setIsImage] = useState(false);
    const [scale, setScale] = useState(1);
    const modalContentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;

        setIsLoading(true);
        fetch(docUrl, { signal })
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch document');
                const contentType = res.headers.get('Content-Type') || '';
                
                if (contentType.startsWith('image/')) {
                    setIsImage(true);
                    return res.blob();
                } else {
                    // For PDFs and other types, use the URL directly
                    setIsImage(false);
                    setContentUrl(docUrl);
                    setIsLoading(false);
                    return null;
                }
            })
            .then(blob => {
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    setContentUrl(url);
                    setIsLoading(false);
                }
            })
            .catch(err => {
                if (err.name !== 'AbortError') {
                    console.error("Error loading document:", err);
                    setIsLoading(false);
                }
            });

        return () => {
            controller.abort();
        };
    }, [docUrl]);

    // Cleanup effect for blob URL
    useEffect(() => {
        return () => {
            if (contentUrl && contentUrl.startsWith('blob:')) {
                URL.revokeObjectURL(contentUrl);
            }
        };
    }, [contentUrl]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        const handleClickOutside = (event: MouseEvent) => {
            if (modalContentRef.current && !modalContentRef.current.contains(event.target as Node)) onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    const handleZoom = (factor: number) => setScale(prev => Math.max(0.2, prev + factor));

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4 sm:p-6 md:p-8">
            <div ref={modalContentRef} className="bg-white rounded-lg shadow-2xl w-full max-w-5xl h-[95vh] flex flex-col">
            <div className="flex justify-between items-center p-2 border-b bg-gray-50 rounded-t-lg">
                <div className="flex items-center gap-2">
                {isImage && !isLoading && (
                    <>
                    <button onClick={() => handleZoom(-0.2)} className="px-3 py-1 text-lg font-bold border rounded bg-white hover:bg-gray-100 disabled:opacity-50" disabled={scale <= 0.2}>-</button>
                    <button onClick={() => handleZoom(0.2)} className="px-3 py-1 text-lg font-bold border rounded bg-white hover:bg-gray-100">+</button>
                    <button onClick={() => setScale(1)} className="px-3 py-1 text-sm border rounded bg-white hover:bg-gray-100">Reset Zoom</button>
                    <a href={contentUrl} download={docName || 'image.jpg'} className="px-3 py-1 text-sm border rounded bg-blue-500 text-white hover:bg-blue-600 no-underline">Download</a>
                    </>
                )}
                </div>
                <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-3xl font-bold leading-none">&times;</button>
            </div>
            <div className="flex-grow p-2 relative bg-gray-200 overflow-hidden">
                {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white z-20">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
                )}
                {!isLoading && contentUrl && (
                isImage ? (
                    <div className="w-full h-full overflow-auto flex items-center justify-center">
                    <img
                        src={contentUrl}
                        alt={docName || "Document Content"}
                        className="w-full h-full object-contain"
                        style={{ transform: `scale(${scale})`, transition: 'transform 0.1s ease-in-out', transformOrigin: 'center' }}
                    />
                    </div>
                ) : (
                    <iframe
                    src={contentUrl}
                    className="w-full h-full border-0"
                    title="Document Viewer"
                    />
                )
                )}
            </div>
            </div>
        </div>
    );
};

// --- Searchable Employee Dropdown ---
const SearchableEmployeeSelect = ({ onEmployeeSelect, disabled }: { onEmployeeSelect: (id: string) => void; disabled?: boolean; }) => {
    const [employees, setEmployees] = useState<HrEmployee[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const listRef = useRef<HTMLUListElement>(null);
    const fetchController = useRef<AbortController | null>(null);
    const loadingStatusRef = useRef({ isLoading, hasMore });
    loadingStatusRef.current = { isLoading, hasMore };
    const fetchEmployees = useCallback((currentSearch: string, currentPage: number, isNewSearch = false) => {
        if (loadingStatusRef.current.isLoading || (!loadingStatusRef.current.hasMore && !isNewSearch)) return;
        if (fetchController.current) fetchController.current.abort();
        fetchController.current = new AbortController();
        const signal = fetchController.current.signal;
        setIsLoading(true);
        fetch(`api/hr_employees?search=${encodeURIComponent(currentSearch)}&page=${currentPage}`, { signal })
            .then(res => res.json())
            .then((data: ApiHrResponse) => {
                setEmployees(prev => isNewSearch ? data.employees : [...prev, ...data.employees]);
                setHasMore(data.hasMore);
            })
            .catch(err => { if (err.name !== 'AbortError') console.error("Fetch error:", err); })
            .finally(() => setIsLoading(false));
    }, []);
    useEffect(() => {
        const handler = setTimeout(() => {
            setEmployees([]); setPage(1); setHasMore(true);
            fetchEmployees(searchTerm, 1, true);
        }, 300);
        return () => clearTimeout(handler);
    }, [searchTerm, fetchEmployees]);
    const handleScroll = () => {
        const list = listRef.current;
        if (list && list.scrollTop + list.clientHeight >= list.scrollHeight - 10) {
            if (hasMore && !isLoading) {
                const nextPage = page + 1;
                setPage(nextPage);
                fetchEmployees(searchTerm, nextPage);
            }
        }
    };
    const handleSelect = (employee: HrEmployee) => {
        setSearchTerm(`${employee.fullname_en} (${employee.empno})`);
        onEmployeeSelect(employee.system_id.toString());
        setIsOpen(false);
    };
    return (
        <div className="relative">
            <input type="text" placeholder="Search by Name or Employee ID to begin..." value={searchTerm} disabled={disabled} onChange={e => { setSearchTerm(e.target.value); setIsOpen(true); }} onFocus={() => setIsOpen(true)} onBlur={() => setTimeout(() => setIsOpen(false), 200)} className="mt-1 p-2 w-full border rounded-md disabled:bg-gray-100" />
            {isOpen && !disabled && (
                <ul ref={listRef} onScroll={handleScroll} className="absolute z-10 w-full bg-white border rounded-md mt-1 max-h-60 overflow-y-auto shadow-lg">
                    {employees.map(emp => (<li key={emp.system_id} onMouseDown={() => handleSelect(emp)} className="p-2 hover:bg-gray-100 cursor-pointer">{emp.fullname_ar} / {emp.fullname_en} ({emp.empno})</li>))}
                    {isLoading && <li className="p-2 text-center text-gray-500">Loading...</li>}
                    {!hasMore && employees.length > 0 && <li className="p-2 text-center text-xs text-gray-400">End of results</li>}
                    {!isLoading && employees.length === 0 && <li className="p-2 text-center text-gray-500">No results found</li>}
                </ul>
            )}
        </div>
    );
};


// --- Employee Form Component ---
const EmployeeForm = ({ employeeToEditId, onBack, onFormSubmit }: { employeeToEditId?: number | null; onBack: () => void; onFormSubmit: () => void; }) => {
    const [statuses, setStatuses] = useState<{ employee_status: Status[] }>({ employee_status: [] });
    const [docTypes, setDocTypes] = useState<DocumentTypesResponse>({ all_types: [], types_with_expiry: [] });
    const [legislations, setLegislations] = useState<Legislation[]>([]);
    const [formData, setFormData] = useState({ employee_id: '', name_en: '', name_ar: '', employeeNumber: '', hireDate: '', jobTitle: '', nationality: '', email: '', phone: '', manager: '', department: '', section: '', status_id: '' });
    const [existingDocuments, setExistingDocuments] = useState<ExistingDocument[]>([]);
    const [newDocuments, setNewDocuments] = useState<NewDocument[]>([]);
    const [deletedDocIds, setDeletedDocIds] = useState<number[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [isFormLocked, setIsFormLocked] = useState(true);
    const [viewingDoc, setViewingDoc] = useState<{ url: string, name: string } | null>(null);

    const expiryDocTypeIds = useMemo(() => new Set(docTypes.types_with_expiry.map(t => t.system_id)), [docTypes.types_with_expiry]);

    const warrantDecisionDocTypeId = useMemo(() => {
        const found = docTypes.all_types.find(dt => dt.name.includes('Warrant Decisions') || dt.name.includes('القرارات الخاصة بالضبطية'));
        return found ? found.system_id : null;
    }, [docTypes]);

    useEffect(() => {
        fetch('api/statuses').then(res => res.json()).then(setStatuses);
        fetch('api/document_types').then(res => res.json()).then(setDocTypes);
        fetch('api/legislations').then(res => res.json()).then(setLegislations);

        if (employeeToEditId) {
            setIsFormLocked(false);
            fetch(`api/employees/${employeeToEditId}`)
                .then(res => res.json())
                .then(details => {
                    const formattedHireDate = details.hire_date 
                        ? new Date(details.hire_date).toISOString().split('T')[0] 
                        : '';
                    setFormData({
                        employee_id: details.employee_id, name_en: details.fullname_en || '', name_ar: details.fullname_ar || '',
                        employeeNumber: details.empno || '', jobTitle: details.job_name || '', department: details.department || '',
                        section: details.section || '', email: details.email || '', phone: details.mobile || '',
                        manager: details.supervisorname || '', nationality: details.nationality || '',
                        hireDate: formattedHireDate,
                        status_id: details.status_id ? details.status_id.toString() : '',
                    });
                    setExistingDocuments(details.documents || []);
                });
        }
    }, [employeeToEditId]);

    const handleEmployeeSelect = async (employeeId: string) => {
        if (!employeeId) { setIsFormLocked(true); return; }
        const res = await fetch(`api/hr_employees/${employeeId}`);
        const details: HrEmployeeDetails = await res.json();
        setFormData({
            employee_id: details.system_id, name_en: details.fullname_en || '', name_ar: details.fullname_ar || '',
            employeeNumber: details.empno || '', jobTitle: details.job_name || '', department: details.department || '',
            section: details.section || '', email: details.email || '', phone: details.mobile || '',
            manager: details.supervisorname || '', nationality: details.nationality || '',
            hireDate: '', status_id: ''
        });
        setIsFormLocked(false);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const addNewDocumentRow = () => setNewDocuments(prev => [...prev, { doc_type_id: '', doc_type_name: '', file: null, expiry: '', legislation_ids: [] }]);
    
    const handleNewDocumentChange = (index: number, field: keyof NewDocument, value: any) => {
        setError('');
        const newDocs = [...newDocuments];
        const doc = newDocs[index];
    
        if (field === 'file' && value instanceof File) {
            const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
            if (!allowedTypes.includes(value.type)) {
                setError('Invalid file type. Please upload only images (JPG, PNG) or PDF files.');
                const fileInput = document.getElementById(`new-file-input-${index}`) as HTMLInputElement;
                if (fileInput) fileInput.value = ""; return;
            }
            doc.file = value;
        } else if (field === 'legislation_ids') {
            const legId = value.toString();
            const isChecked = doc.legislation_ids.includes(legId);
            doc.legislation_ids = isChecked
                ? doc.legislation_ids.filter(id => id !== legId)
                : [...doc.legislation_ids, legId];
        } else if (typeof value === 'string') {
            (doc as any)[field] = value;
            if (field === 'doc_type_id') {
                const selectedDocType = docTypes.all_types.find(dt => dt.system_id.toString() === value);
                doc.doc_type_name = selectedDocType ? selectedDocType.name : '';
                 // Reset legislations if doc type changes
                if (doc.doc_type_id !== warrantDecisionDocTypeId?.toString()) {
                    doc.legislation_ids = [];
                }
            }
        }
        setNewDocuments(newDocs);
    };

    const handleExistingDocLegislationChange = (docSystemId: number, legislationId: number) => {
        setExistingDocuments(prevDocs => 
            prevDocs.map(doc => {
                if (doc.system_id === docSystemId) {
                    const isSelected = doc.legislation_ids.includes(legislationId);
                    const newLegislationIds = isSelected
                        ? doc.legislation_ids.filter(id => id !== legislationId)
                        : [...doc.legislation_ids, legislationId];
                    return { ...doc, legislation_ids: newLegislationIds };
                }
                return doc;
            })
        );
    };

    const removeNewDocumentRow = (index: number) => {
        setNewDocuments(prev => prev.filter((_, i) => i !== index));
    };

    const handleDeleteExistingDoc = (docId: number) => {
        setExistingDocuments(prev => prev.filter(doc => doc.system_id !== docId));
        setDeletedDocIds(prev => [...prev, docId]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!formData.employee_id) { setError('An employee must be selected.'); return; }

        for (const doc of newDocuments) {
            if (doc.doc_type_id) {
                const docType = docTypes.all_types.find(t => t.system_id.toString() === doc.doc_type_id);
                if (expiryDocTypeIds.has(parseInt(doc.doc_type_id, 10)) && !doc.expiry) {
                    setError(`Expiry date is required for document type "${docType?.name}".`);
                    return;
                }
            }
        }
        
        setIsSubmitting(true);
        const submissionData = new FormData();
        submissionData.append('employee_data', JSON.stringify(formData));

        newDocuments.forEach((doc, index) => {
            if (doc.file && doc.doc_type_id) {
                submissionData.append(`new_documents[${index}][file]`, doc.file);
                submissionData.append(`new_documents[${index}][doc_type_id]`, doc.doc_type_id);
                submissionData.append(`new_documents[${index}][doc_type_name]`, doc.doc_type_name);
                submissionData.append(`new_documents[${index}][expiry]`, doc.expiry);
                if (doc.legislation_ids) {
                    doc.legislation_ids.forEach(legId => {
                        submissionData.append(`new_documents[${index}][legislation_ids][]`, legId);
                    });
                }
            }
        });

        submissionData.append('deleted_documents', JSON.stringify(deletedDocIds));

        if (employeeToEditId) {
            const updatedDocs = existingDocuments
                .filter(doc => doc.doc_type_id === warrantDecisionDocTypeId)
                .map(doc => ({
                    system_id: doc.system_id,
                    legislation_ids: doc.legislation_ids
                }));
            submissionData.append('updated_documents', JSON.stringify(updatedDocs));
        }

        const isEditMode = !!employeeToEditId;
        const url = isEditMode ? `api/employees/${employeeToEditId}` : 'api/employees';
        const method = isEditMode ? 'PUT' : 'POST';

        const response = await fetch(url, { method, body: submissionData });
        if (response.ok) { onFormSubmit(); onBack(); } 
        else { const result = await response.json(); setError(result.error || 'An error occurred.'); }
        setIsSubmitting(false);
    };

    const usedDocTypeIds = useMemo(() => {
        const existing = existingDocuments.map(doc => doc.doc_type_id);
        const newOnes = newDocuments.map(doc => parseInt(doc.doc_type_id, 10));
        return new Set([...existing, ...newOnes].filter(Boolean));
    }, [existingDocuments, newDocuments]);

    return (
        <>
            {viewingDoc && <DocumentViewerModal docUrl={viewingDoc.url} docName={viewingDoc.name} onClose={() => setViewingDoc(null)} />}
            <div className="bg-white p-6 rounded-lg shadow">
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                    <h2 className="text-xl font-semibold">{employeeToEditId ? 'Edit Employee Archive' : 'Add New Employee Archive'}</h2>
                    <button onClick={onBack} className="text-gray-600 hover:text-gray-800">&larr; Back</button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-8">
                    <div>
                        <h3 className="text-lg font-semibold mb-4 text-blue-700">First: Employee Data / أولاً: بيانات الموظف</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-3"><label className="block text-sm font-medium">Select Employee / اختر الموظف</label>{employeeToEditId ? <input type="text" value={`${formData.name_en} (${formData.employeeNumber})`} className="mt-1 p-2 w-full border rounded-md bg-gray-100" readOnly /> : <SearchableEmployeeSelect onEmployeeSelect={handleEmployeeSelect} />}</div>
                            <fieldset disabled={isFormLocked} className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 disabled:opacity-50">
                                <div><label className="block text-sm">Name (EN) / الاسم (انجليزي):</label><input type="text" name="name_en" value={formData.name_en || ''} className="mt-1 p-2 w-full border rounded-md bg-gray-100" readOnly required /></div>
                                <div><label className="block text-sm">Name (AR) / الاسم (عربي):</label><input type="text" name="name_ar" value={formData.name_ar || ''} className="mt-1 p-2 w-full border rounded-md bg-gray-100" readOnly /></div>
                                <div><label className="block text-sm">Employee ID / الرقم الوظيفي:</label><input type="text" name="employeeNumber" value={formData.employeeNumber || ''} className="mt-1 p-2 w-full border rounded-md bg-gray-100" readOnly required /></div>
                                <div><label className="block text-sm">Hire Date / تاريخ التعيين:</label><input type="date" name="hireDate" value={formData.hireDate || ''} onChange={handleInputChange} className="mt-1 p-2 w-full border rounded-md" /></div>
                                <div><label className="block text-sm">Job Title / الوظيفة:</label><input type="text" name="jobTitle" value={formData.jobTitle || ''} onChange={handleInputChange} className="mt-1 p-2 w-full border rounded-md" /></div>
                                <div><label className="block text-sm">Nationality / الجنسية:</label><input type="text" name="nationality" value={formData.nationality || ''} onChange={handleInputChange} className="mt-1 p-2 w-full border rounded-md" /></div>
                                <div><label className="block text-sm">Email / البريد الالكتروني:</label><input type="email" name="email" value={formData.email || ''} onChange={handleInputChange} className="mt-1 p-2 w-full border rounded-md" /></div>
                                <div><label className="block text-sm">Phone / الهاتف:</label><input type="tel" name="phone" value={formData.phone || ''} onChange={handleInputChange} className="mt-1 p-2 w-full border rounded-md" /></div>
                                <div><label className="block text-sm">Manager / المسؤول المباشر:</label><input type="text" name="manager" value={formData.manager || ''} onChange={handleInputChange} className="mt-1 p-2 w-full border rounded-md" /></div>
                                <div><label className="block text-sm">Department / الإدارة:</label><input type="text" name="department" value={formData.department || ''} onChange={handleInputChange} className="mt-1 p-2 w-full border rounded-md" /></div>
                                <div><label className="block text-sm">Section / القسم:</label><input type="text" name="section" value={formData.section || ''} onChange={handleInputChange} className="mt-1 p-2 w-full border rounded-md" /></div>
                                <div><label className="block text-sm">Employee Status / حالة الموظف:</label><select name="status_id" value={formData.status_id || ''} onChange={handleInputChange} className="mt-1 p-2 w-full border rounded-md" required><option value="">-- Select --</option>{statuses.employee_status.map(s => <option key={s.system_id} value={s.system_id}>{s.name_arabic} / {s.name_english}</option>)}</select></div>
                            </fieldset>
                        </div>
                    </div>
                    <fieldset disabled={isFormLocked} className="disabled:opacity-50">
                        <div>
                            <h3 className="text-lg font-semibold mb-4 text-blue-700">Second: Documents / ثانياً: المستندات</h3>
                            {employeeToEditId && existingDocuments.length > 0 && ( 
                                <div className="space-y-2 mb-4"> 
                                    <h4 className="text-sm font-semibold">Existing Documents / المستندات الحالية:</h4> 
                                    {existingDocuments.map(doc => {
                                        const isWarrantDecision = warrantDecisionDocTypeId && doc.doc_type_id === warrantDecisionDocTypeId;
                                        return (
                                            <div key={doc.system_id} className="p-3 border rounded-md bg-gray-50 text-sm"> 
                                                <div className="flex justify-between items-center"> 
                                                    <span className="font-semibold">{doc.doc_name}</span> 
                                                    <div className="flex items-center gap-4"> 
                                                        {doc.expiry && (
                                                            <span className="text-xs text-gray-600 bg-gray-200 px-2 py-1 rounded">
                                                                expires / تنتهي: {doc.expiry}
                                                            </span>
                                                        )}
                                                        <button type="button" title="View Document" onClick={() => setViewingDoc({ url: `api/document/${doc.docnumber}`, name: doc.doc_name })} className="text-gray-500 hover:text-gray-800">
                                                            <img src="/eye-icon.svg" alt="View" className="h-5 w-5" />
                                                        </button>
                                                        <button type="button" title="Remove Document" onClick={() => handleDeleteExistingDoc(doc.system_id)} className="text-red-500/75 hover:text-red-700">
                                                            <img src="/trash-icon.svg" alt="Remove" className="h-5 w-5" />
                                                        </button> 
                                                    </div> 
                                                </div> 
                                                {isWarrantDecision && (
                                                    <div className="mt-2">
                                                        <label className="text-xs font-semibold text-gray-700">Related Legislation / التشريع المرتبط</label>
                                                        <div className="mt-1 p-2 border rounded-md bg-white max-h-32 overflow-y-auto space-y-1">
                                                            {legislations.map(leg => (
                                                                <label key={leg.system_id} className="flex items-center space-x-2 rtl:space-x-reverse cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={doc.legislation_ids.includes(leg.system_id)}
                                                                        onChange={() => handleExistingDocLegislationChange(doc.system_id, leg.system_id)}
                                                                        className="rounded"
                                                                    />
                                                                    <span className="text-sm">{leg.name}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div> 
                                        );
                                    })} 
                                </div> 
                            )}
                            <div className="space-y-4">
                                {newDocuments.map((doc, index) => {
                                    const showExpiry = expiryDocTypeIds.has(parseInt(doc.doc_type_id, 10));
                                    const isWarrantDecision = warrantDecisionDocTypeId && doc.doc_type_id === warrantDecisionDocTypeId.toString();
                                    return (
                                        <div key={index} className="flex items-start justify-between p-3 border rounded-md bg-gray-50 space-x-4 rtl:space-x-reverse">
                                            <div className="flex-grow space-y-3">
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                                                    <div>
                                                        <label className="text-xs">Document Type / نوع المستند</label>
                                                        <select value={doc.doc_type_id} onChange={e => handleNewDocumentChange(index, 'doc_type_id', e.target.value)} className="p-2 w-full border rounded-md" required>
                                                            <option value="">-- Select / اختر --</option>
                                                            {docTypes.all_types.map(type => <option key={type.system_id} value={type.system_id} disabled={usedDocTypeIds.has(type.system_id)}>{type.name}</option>)}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-xs">File / الملف</label>
                                                        <input id={`new-file-input-${index}`} type="file" onChange={e => handleNewDocumentChange(index, 'file', e.target.files ? e.target.files[0] : null)} className="p-1 w-full border rounded-md text-sm bg-white" accept="image/jpeg,image/png,application/pdf" required />
                                                    </div>
                                                    <div>
                                                        {showExpiry && (
                                                            <>
                                                                <label className="text-xs">Expiry Date / تاريخ الانتهاء</label>
                                                                <input type="date" value={doc.expiry} onChange={e => handleNewDocumentChange(index, 'expiry', e.target.value)} className="p-2 w-full border rounded-md" required />
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                {isWarrantDecision && (
                                                    <div className="mt-2">
                                                        <label className="text-xs font-semibold text-gray-700">Related Legislation / التشريع المرتبط</label>
                                                        <div className="mt-1 p-2 border rounded-md bg-white max-h-32 overflow-y-auto space-y-1">
                                                        {legislations.map(leg => (
                                                            <label key={leg.system_id} className="flex items-center space-x-2 rtl:space-x-reverse cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={doc.legislation_ids.includes(leg.system_id.toString())}
                                                                    onChange={() => handleNewDocumentChange(index, 'legislation_ids', leg.system_id.toString())}
                                                                    className="rounded"
                                                                />
                                                                <span className="text-sm">{leg.name}</span>
                                                            </label>
                                                        ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeNewDocumentRow(index)}
                                                className="text-gray-400 hover:text-red-600 font-bold text-2xl mt-5"
                                                title="Remove this document"
                                            >
                                                &times;
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-4"><button type="button" onClick={addNewDocumentRow} className="bg-green-500 text-white font-bold py-2 px-4 rounded-md hover:bg-green-600">+ Add New Document / إضافة مستند جديد</button></div>
                        </div>
                    </fieldset>
                    {error && <div className="text-sm text-red-700 p-3 bg-red-100 rounded-md">{error}</div>}
                    <div className="flex justify-end pt-4"><button type="submit" className="bg-blue-600 text-white font-bold py-2 px-6 rounded-md" disabled={isSubmitting || isFormLocked}>{isSubmitting ? 'Saving...' : 'Save Data / حفظ البيانات'}</button></div>
                </form>
            </div>
        </>
    );
};

// --- Main Page Component ---
export default function DashboardPage() {
    const [view, setView] = useState<'dashboard' | 'form'>('dashboard');
    const [user, setUser] = useState<string | null>(null);
    const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null);
    const router = useRouter();
    const [dataRefreshKey, setDataRefreshKey] = useState(0);

    useEffect(() => {
        fetch('api/auth/user')
            .then(res => res.ok ? res.json() : Promise.reject())
            .then(data => data.user?.username ? setUser(data.user.username) : router.push('/login'))
            .catch(() => router.push('/login'));
    }, [router]);

    const handleFormSubmit = () => setDataRefreshKey(k => k + 1);

    const handleLogout = async () => {
        await fetch('api/auth/logout', { method: 'POST' });
        router.push('/login');
    };

    const handleEdit = (employee: ArchivedEmployee) => {
        if (employee.system_id) {
            setEditingEmployeeId(employee.system_id);
            setView('form');
        }
    };

    const handleBackFromForm = () => {
        setEditingEmployeeId(null);
        setView('dashboard');
    };

    if (!user) return <div className="flex items-center justify-center min-h-screen">Verifying session...</div>;

    return (
        <div className="min-h-screen bg-gray-50 text-gray-800">
            <header className="bg-white shadow-sm sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-gray-900">نظام أرشفة الموظفين / Employee Archiving System</h1>
                    <div className="flex items-center gap-4">
                        <div className="text-sm">مرحباً / Welcome, <span className="font-semibold">{user}</span></div>
                        <button onClick={handleLogout} className="bg-red-500 text-white text-xs font-bold py-1 px-3 rounded-md hover:bg-red-600">تسجيل الخروج</button>
                    </div>
                </div>
            </header>
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {view === 'dashboard' ? (
                    <DashboardView onAddNew={() => setView('form')} onEdit={handleEdit} dataRefreshKey={dataRefreshKey} />
                ) : (
                    <EmployeeForm onBack={handleBackFromForm} onFormSubmit={handleFormSubmit} employeeToEditId={editingEmployeeId} />
                )}
            </main>
        </div>
    );
}

// --- Dashboard View Component ---
const DashboardView = ({ onAddNew, onEdit, dataRefreshKey }: { onAddNew: () => void; onEdit: (emp: ArchivedEmployee) => void; dataRefreshKey: number; }) => {
    const [employees, setEmployees] = useState<ArchivedEmployee[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [dashboardCounts, setDashboardCounts] = useState({
        total_employees: 0,
        active_employees: 0,
        judicial_warrants: 0,
        expiring_soon: 0,
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string | null>(null);
    const [filterType, setFilterType] = useState<string | null>(null);

    const getCardStatusBadgeClass = (statusClass: string) => {
        switch (statusClass) {
            case 'expired': return 'status-badge status-expired';
            case 'expiring-soon': return 'status-badge status-expiring-soon';
            case 'valid': return 'status-badge status-valid';
            default: return '';
        }
    };

    const getStatusBadgeClass = (status?: string | null) => {
        switch (status) {
            case 'Active': return 'status-badge status-active';
            case 'Inactive': return 'status-badge status-inactive';
            case 'Disabled': return 'status-badge status-disabled';
            default: return 'status-badge';
        }
    };

    useEffect(() => {
        fetch('api/dashboard_counts')
            .then(res => res.json())
            .then(setDashboardCounts);
    }, [dataRefreshKey]);

    useEffect(() => {
        setIsLoading(true);
        const params = new URLSearchParams();
        if (searchTerm) {
            params.append('search', searchTerm);
        }
        if (statusFilter) {
            params.append('status', statusFilter);
        }
        if (filterType) {
            params.append('filter_type', filterType);
        }
        const url = `api/employees?${params.toString()}`;
        fetch(url)
            .then(res => res.json())
            .then((data: ApiEmployeeResponse) => {
                if (data && Array.isArray(data.employees)) {
                    setEmployees(data.employees);
                }
                setIsLoading(false);
            })
            .catch(() => setIsLoading(false));
    }, [dataRefreshKey, searchTerm, statusFilter, filterType]);

    return (
        <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                <h2 className="text-xl font-bold">لوحة المعلومات / Dashboard</h2>
                <button onClick={onAddNew} className="w-full md:w-auto bg-blue-600 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-700">
                    + إضافة موظف جديد / Add New Employee
                </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div onClick={() => { setStatusFilter(null); setFilterType(null); }} className="bg-blue-50 p-4 rounded-lg text-center border cursor-pointer">
                    <p className="text-sm font-semibold text-blue-800">إجمالي الموظفين / Total Employees</p>
                    <h3 className="text-3xl font-bold text-blue-900 mt-2">{dashboardCounts.total_employees}</h3>
                </div>
                <div onClick={() => { setStatusFilter('Active'); setFilterType(null); }} className="bg-green-50 p-4 rounded-lg text-center border cursor-pointer">
                    <p className="text-sm font-semibold text-green-800">الموظفين الفعالين / Active Employees</p>
                    <h3 className="text-3xl font-bold text-green-900 mt-2">{dashboardCounts.active_employees}</h3>
                </div>
                <div onClick={() => { setStatusFilter(null); setFilterType('judicial_warrant'); }} className="bg-indigo-50 p-4 rounded-lg text-center border cursor-pointer">
                    <p className="text-sm font-semibold text-indigo-800">مأموري الضبط / Judicial Warrants</p>
                    <h3 className="text-3xl font-bold text-indigo-900 mt-2">{dashboardCounts.judicial_warrants}</h3>
                </div>
                <div onClick={() => { setStatusFilter(null); setFilterType('expiring_soon'); }} className="bg-yellow-50 p-4 rounded-lg text-center border cursor-pointer">
                    <p className="text-sm font-semibold text-yellow-800">مستندات ستنتهي قريباً / Expiring Soon</p>
                    <h3 className="text-3xl font-bold text-yellow-900 mt-2">{dashboardCounts.expiring_soon}</h3>
                </div>
            </div>
            <div className="mb-6"><input type="text" placeholder="ابحث بالاسم، الرقم الوظيفي... / Search by Name, Employee No..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-2 border rounded-md" /></div>
            <div className="overflow-x-auto no-scrollbar">
                <table className="w-full table-auto">
                    <thead className="bg-gray-100 border-b">
                        <tr>
                            <th className="p-3 font-bold text-sm text-right">م / #</th>
                            <th className="p-3 font-bold text-sm text-right">الرقم الوظيفي / Emp. ID</th>
                            <th className="p-3 font-bold text-sm text-right">الاسم / Name</th>
                            <th className="p-3 font-bold text-sm text-right">الإدارة/القسم / Dept./Section</th>
                            <th className="p-3 font-bold text-sm text-right">حالة الموظف / Status</th>
                            <th className="p-3 font-bold text-sm text-right">حالة الضبطية / Warrant Status</th>
                            <th className="p-3 font-bold text-sm text-right">حالة البطاقة / Card Status</th>
                            <th className="p-3 font-bold text-sm text-right">انتهاء البطاقة / Card Expiry</th>
                            <th className="p-3 font-bold text-sm text-right">إجراءات / Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr><td colSpan={9} className="text-center p-10">Loading...</td></tr>
                        ) : employees.length > 0 ? (
                            employees.map((emp, index) => (
                                <tr key={emp.system_id} className="border-b hover:bg-gray-50">
                                    <td className="p-3 text-sm text-right">{index + 1}</td>
                                    <td className="p-3 text-sm text-right">{emp.empno}</td>
                                    <td className="p-3 text-sm font-semibold text-blue-600 text-right">{emp.fullname_en}</td>
                                    <td className="p-3 text-sm text-right">{emp.department} / {emp.section || 'N/A'}</td>
                                    <td className="p-3 text-sm text-right"><span className={getStatusBadgeClass(emp.status_en)}>{emp.status_ar || 'N/A'}</span></td>
                                    <td className="p-3 text-sm text-right">{emp.warrant_status}</td>
                                    <td className="p-3 text-sm text-right">{emp.card_status}</td>
                                    <td className="p-3 text-sm text-right">
                                        {emp.card_expiry !== 'N/A' && (
                                            <span className={getCardStatusBadgeClass(emp.card_status_class)}>{emp.card_expiry}</span>
                                        )}
                                        {emp.card_expiry === 'N/A' && emp.card_expiry}
                                    </td>
                                    <td className="p-3 text-sm text-right"><button onClick={() => onEdit(emp)} className="text-blue-500 hover:underline">تعديل / Edit</button></td>
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan={9} className="text-center p-10 text-gray-500">No employees have been archived yet.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};