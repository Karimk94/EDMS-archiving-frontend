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
type User = { username: string; security_level: 'Editor' | 'Viewer'; };

// Define basePath globally for the component
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

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
        fetch(`${basePath}${docUrl}`, { signal }) // Add basePath to fetch
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch document');
                const contentType = res.headers.get('Content-Type') || '';

                if (contentType.startsWith('image/')) {
                    setIsImage(true);
                    return res.blob();
                } else {
                    setIsImage(false);
                    setContentUrl(`${basePath}${docUrl}`); // Add basePath to URL
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

    useEffect(() => {
        return () => {
            if (contentUrl && contentUrl.startsWith('blob:')) {
                URL.revokeObjectURL(contentUrl);
            }
        };
    }, [contentUrl]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        const handleClickOutside = (event: MouseEvent) => { if (modalContentRef.current && !modalContentRef.current.contains(event.target as Node)) onClose(); };
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
                    {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-white z-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}
                    {!isLoading && contentUrl && (isImage ? <div className="w-full h-full overflow-auto flex items-center justify-center"><img src={contentUrl} alt={docName || "Document Content"} className="w-full h-full object-contain" style={{ transform: `scale(${scale})`, transition: 'transform 0.1s ease-in-out', transformOrigin: 'center' }} /></div> : <iframe src={contentUrl} className="w-full h-full border-0" title="Document Viewer" />)}
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
        fetch(`${basePath}/api/hr_employees?search=${encodeURIComponent(currentSearch)}&page=${currentPage}`, { signal })
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
            <input type="text" placeholder="Search by Name or Employee ID to begin..." value={searchTerm} readOnly={disabled} onChange={e => { setSearchTerm(e.target.value); setIsOpen(true); }} onFocus={() => setIsOpen(true)} onBlur={() => setTimeout(() => setIsOpen(false), 200)} className="mt-1 p-2 w-full border rounded-md read-only:bg-gray-100 read-only:cursor-not-allowed" />
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

// --- Searchable Nationality Dropdown ---
const SearchableNationalitySelect = ({ value, onChange, disabled, nationalities }: { value: string; onChange: (value: string) => void; disabled?: boolean; nationalities: string[] }) => {
    const [searchTerm, setSearchTerm] = useState(value || '');
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setSearchTerm(value);
    }, [value]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearchTerm(value);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [wrapperRef, value]);

    const filteredNationalities = useMemo(() =>
        nationalities.filter(nat =>
            nat.toLowerCase().includes(searchTerm.toLowerCase())
        ), [searchTerm, nationalities]
    );

    const isCurrentValueInList = useMemo(() =>
        nationalities.some(nat => nat.toLowerCase() === value.toLowerCase()),
        [value, nationalities]
    );

    const handleSelect = (nationality: string) => {
        setSearchTerm(nationality);
        onChange(nationality);
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={wrapperRef}>
            <div className="relative">
                <input
                    type="text"
                    value={searchTerm}
                    onChange={e => {
                        setSearchTerm(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    disabled={disabled}
                    className="mt-1 p-2 w-full border rounded-md disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
                {!isCurrentValueInList && value && (
                    <span className="absolute end-2 top-1/2 -translate-y-1/2 text-yellow-500" title={`Nationality "${value}" is not in the predefined list.`}>
                        ⚠️
                    </span>
                )}
            </div>
            {isOpen && !disabled && (
                <ul className="absolute z-20 w-full bg-white border rounded-md mt-1 max-h-60 overflow-y-auto shadow-lg">
                    {filteredNationalities.length > 0 ? (
                        filteredNationalities.map(nat => (
                            <li key={nat} onMouseDown={() => handleSelect(nat)} className="p-2 hover:bg-gray-100 cursor-pointer">
                                {nat}
                            </li>
                        ))
                    ) : (
                        <li className="p-2 text-center text-gray-500">No results found</li>
                    )}
                </ul>
            )}
        </div>
    );
};

const BulkAddModal = ({ onClose, onUploadSuccess }: { onClose: () => void; onUploadSuccess: () => void; }) => {
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [uploadResult, setUploadResult] = useState<{ message: string; errors?: string[] } | null>(null);
    const modalContentRef = useRef<HTMLDivElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            if (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.csv')) {
                setFile(selectedFile);
                setError(null);
                setUploadResult(null);
            } else {
                setError('Invalid file type. Please upload a .xlsx or .csv file.');
                setFile(null);
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            setError('Please select a file to upload.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setUploadResult(null);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${basePath}/api/employees/bulk-upload`, {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (response.ok) {
                setUploadResult({ message: result.message || 'Upload successful!' });
                setFile(null);
                // Automatically close and refresh after 2 seconds on full success
                setTimeout(() => {
                    onUploadSuccess();
                    onClose();
                }, 2000);
            } else {
                // Handle partial success (422) or failure
                const errorMessage = result.error || 'An unknown error occurred.';
                setError(errorMessage);
                if (result.errors) {
                    setUploadResult({ message: result.message || 'Upload completed with errors:', errors: result.errors });
                } else {
                    setUploadResult({ message: 'Upload Failed:', errors: [errorMessage] });
                }
            }
        } catch (err) {
            console.error('Bulk upload fetch error:', err);
            setError('An error occurred while communicating with the server.');
            setUploadResult({ message: 'Upload Failed:', errors: ['Network error or server unavailable.'] });
        } finally {
            setIsLoading(false);
        }
    };

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (modalContentRef.current && !modalContentRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);


    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div ref={modalContentRef} className="bg-white rounded-lg shadow-xl w-full max-w-2xl flex flex-col">
                <div className="flex justify-between items-center p-4 border-b">
                    <h3 className="text-lg font-semibold">Bulk Add Employees</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-3xl font-bold leading-none">&times;</button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700">
                            Upload Excel or CSV File
                        </label>
                        <p className="text-xs text-gray-500 mb-2">
                            Must contain columns: Employee ID, Name (AR), Name (EN), Hire Date (DD/MM/YYYY), Nationality, Job Title, Manager, Phone, Email, Employee Status, Section, Department
                        </p>
                        <input
                            id="file-upload"
                            type="file"
                            accept=".xlsx, .csv"
                            onChange={handleFileChange}
                            className="mt-1 block w-full text-sm text-gray-500
                                    file:mr-4 file:py-2 file:px-4
                                    file:rounded-md file:border-0
                                    file:text-sm file:font-semibold
                                    file:bg-blue-50 file:text-blue-700
                                    hover:file:bg-blue-100"
                        />
                    </div>

                    {error && <div className="text-sm text-red-700 p-3 bg-red-100 rounded-md">{error}</div>}

                    {uploadResult && (
                        <div className={`text-sm p-3 rounded-md ${uploadResult.errors ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                            <p className="font-bold">{uploadResult.message}</p>
                            {uploadResult.errors && (
                                <ul className="list-disc list-inside mt-2 max-h-40 overflow-y-auto">
                                    {uploadResult.errors.map((err, i) => (
                                        <li key={i} className="text-xs">{err}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded-md hover:bg-gray-300"
                        >
                            Close
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading || !file}
                            className="bg-blue-600 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
                        >
                            {isLoading ? 'Uploading...' : 'Upload and Process'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- Employee Form Component ---
const EmployeeForm = ({ employeeToEditId, onBack, onFormSubmit, user }: { employeeToEditId?: number | null; onBack: () => void; onFormSubmit: () => void; user: User | null; }) => {
    const [statuses, setStatuses] = useState<{ employee_status: Status[] }>({ employee_status: [] });
    const [docTypes, setDocTypes] = useState<DocumentTypesResponse>({ all_types: [], types_with_expiry: [] });
    const [legislations, setLegislations] = useState<Legislation[]>([]);
    const [nationalities, setNationalities] = useState<string[]>([]);
    const [formData, setFormData] = useState({ employee_id: '', name_en: '', name_ar: '', employeeNumber: '', hireDate: '', jobTitle: '', nationality: '', email: '', phone: '', manager: '', department: '', section: '', status_id: '' });
    const [existingDocuments, setExistingDocuments] = useState<ExistingDocument[]>([]);
    const [newDocuments, setNewDocuments] = useState<NewDocument[]>([]);
    const [deletedDocIds, setDeletedDocIds] = useState<number[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [isFormLocked, setIsFormLocked] = useState(true);
    const [viewingDoc, setViewingDoc] = useState<{ url: string, name: string } | null>(null);

    const isViewer = user?.security_level === 'Viewer';

    const expiryDocTypeIds = useMemo(() => new Set(docTypes.types_with_expiry.map(t => t.system_id)), [docTypes.types_with_expiry]);
    const warrantDecisionDocTypeId = useMemo(() => docTypes.all_types.find(dt => dt.name.includes('Warrant Decisions') || dt.name.includes('القرارات الخاصة بالضبطية'))?.system_id, [docTypes]);
    const judicialCardDocTypeId = useMemo(() => docTypes.all_types.find(dt => dt.name.includes('Judicial Card') || dt.name.includes('بطاقة الضبطية'))?.system_id, [docTypes]);

    useEffect(() => {
        fetch(`${basePath}/api/statuses`).then(res => res.json()).then(setStatuses);
        fetch(`${basePath}/api/document_types`).then(res => res.json()).then(setDocTypes);
        fetch(`${basePath}/api/legislations`).then(res => res.json()).then(setLegislations);
        fetch(`${basePath}/nationalities.json`).then(res => res.json()).then(setNationalities);

        if (employeeToEditId) {
            setIsFormLocked(false);
            fetch(`${basePath}/api/employees/${employeeToEditId}`)
                .then(res => res.json())
                .then(details => {
                    const formattedHireDate = details.hire_date ? new Date(details.hire_date).toISOString().split('T')[0] : '';
                    setFormData({ employee_id: details.employee_id, name_en: details.fullname_en || '', name_ar: details.fullname_ar || '', employeeNumber: details.empno || '', jobTitle: details.job_name || '', department: details.department || '', section: details.section || '', email: details.email || '', phone: details.mobile || '', manager: details.supervisorname || '', nationality: details.nationality || '', hireDate: formattedHireDate, status_id: details.status_id ? details.status_id.toString() : '', });
                    setExistingDocuments(details.documents || []);
                });
        }
    }, [employeeToEditId]);

    useEffect(() => {
        if (isFormLocked || !judicialCardDocTypeId || statuses.employee_status.length === 0) return;

        const allJudicialCardDocs = [
            ...existingDocuments.filter(doc => doc.doc_type_id === judicialCardDocTypeId),
            ...newDocuments.filter(doc => doc.doc_type_id === judicialCardDocTypeId.toString())
        ];

        const hasJudicialCard = allJudicialCardDocs.length > 0;

        const activeStatus = statuses.employee_status.find(s => s.name_english === 'Active');
        const inactiveStatus = statuses.employee_status.find(s => s.name_english === 'Inactive');

        if (hasJudicialCard && activeStatus) {
            setFormData(prev => ({ ...prev, status_id: activeStatus.system_id.toString() }));
        } else if (!hasJudicialCard && inactiveStatus) {
            // If no card, set to Inactive
            setFormData(prev => ({ ...prev, status_id: inactiveStatus.system_id.toString() }));
        }

    }, [existingDocuments, newDocuments, judicialCardDocTypeId, statuses, isFormLocked]);

    const handleEmployeeSelect = async (employeeId: string) => {
        if (!employeeId) { setIsFormLocked(true); return; }
        const res = await fetch(`${basePath}/api/hr_employees/${employeeId}`);
        const details: HrEmployeeDetails = await res.json();
        setFormData({ employee_id: details.system_id, name_en: details.fullname_en || '', name_ar: details.fullname_ar || '', employeeNumber: details.empno || '', jobTitle: details.job_name || '', department: details.department || '', section: details.section || '', email: details.email || '', phone: details.mobile || '', manager: details.supervisorname || '', nationality: details.nationality || '', hireDate: '', status_id: '' });
        setIsFormLocked(false);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handleNationalityChange = (value: string) => setFormData(prev => ({ ...prev, nationality: value }));

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
            doc.legislation_ids = isChecked ? doc.legislation_ids.filter(id => id !== legId) : [...doc.legislation_ids, legId];
        } else if (typeof value === 'string') {
            (doc as any)[field] = value;
            if (field === 'doc_type_id') {
                const selectedDocType = docTypes.all_types.find(dt => dt.system_id.toString() === value);
                doc.doc_type_name = selectedDocType ? selectedDocType.name : '';
                if (doc.doc_type_id !== warrantDecisionDocTypeId?.toString()) doc.legislation_ids = [];
            }
        }
        setNewDocuments(newDocs);
    };

    const handleExistingDocLegislationChange = (docSystemId: number, legislationId: number) => {
        setExistingDocuments(prevDocs => prevDocs.map(doc => doc.system_id === docSystemId ? { ...doc, legislation_ids: doc.legislation_ids.includes(legislationId) ? doc.legislation_ids.filter(id => id !== legislationId) : [...doc.legislation_ids, legislationId] } : doc));
    };

    const removeNewDocumentRow = (index: number) => setNewDocuments(prev => prev.filter((_, i) => i !== index));
    const handleDeleteExistingDoc = (docId: number) => { setExistingDocuments(prev => prev.filter(doc => doc.system_id !== docId)); setDeletedDocIds(prev => [...prev, docId]); };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isViewer) return;
        setError('');
        if (!formData.employee_id) { setError('An employee must be selected.'); return; }
        for (const doc of newDocuments) {
            if (doc.doc_type_id) {
                const docType = docTypes.all_types.find(t => t.system_id.toString() === doc.doc_type_id);
                if (expiryDocTypeIds.has(parseInt(doc.doc_type_id, 10)) && !doc.expiry) { setError(`Expiry date is required for document type "${docType?.name}".`); return; }
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
                doc.legislation_ids?.forEach(legId => submissionData.append(`new_documents[${index}][legislation_ids][]`, legId));
            }
        });
        submissionData.append('deleted_documents', JSON.stringify(deletedDocIds));
        if (employeeToEditId) {
            const updatedDocs = existingDocuments.filter(doc => doc.doc_type_id === warrantDecisionDocTypeId).map(doc => ({ system_id: doc.system_id, legislation_ids: doc.legislation_ids }));
            submissionData.append('updated_documents', JSON.stringify(updatedDocs));
        }
        const isEditMode = !!employeeToEditId;
        const url = isEditMode ? `${basePath}/api/employees/${employeeToEditId}` : `${basePath}/api/employees`; // Add basePath
        const method = isEditMode ? 'PUT' : 'POST';

        const response = await fetch(url, { method, body: submissionData });
        if (response.ok) { onFormSubmit(); onBack(); } else { const result = await response.json(); setError(result.error || 'An error occurred.'); }
        setIsSubmitting(false);
    };


    const usedDocTypeIds = useMemo(() => {
        const otherDocTypeName = 'other'; // Define the name for "Other" type
        const allNewDocTypes = newDocuments.map(doc => doc.doc_type_name).filter(Boolean);
        const usedNonOtherTypes = new Set<number>();

        // Add existing doc types
        existingDocuments.forEach(doc => {
            if (!doc.doc_name.toLowerCase().includes(otherDocTypeName)) {
                usedNonOtherTypes.add(doc.doc_type_id);
            }
        });

        // Add new doc types
        newDocuments.forEach(doc => {
            const docTypeId = parseInt(doc.doc_type_id, 10);
            if (docTypeId && !doc.doc_type_name.toLowerCase().includes(otherDocTypeName)) {
                usedNonOtherTypes.add(docTypeId);
            }
        });

        return usedNonOtherTypes;
    }, [existingDocuments, newDocuments]);

    const inputClassName = "mt-1 p-2 w-full border rounded-md read-only:bg-gray-100 read-only:cursor-not-allowed";
    const selectClassName = "mt-1 p-2 w-full border rounded-md disabled:bg-gray-100 disabled:cursor-not-allowed disabled:appearance-none";
    const checkboxClassName = "rounded disabled:cursor-not-allowed";

    return (
        <>
            {viewingDoc && <DocumentViewerModal docUrl={`/api/document/${viewingDoc.url}`} docName={viewingDoc.name} onClose={() => setViewingDoc(null)} />}
            <div className="bg-white p-6 rounded-lg shadow">
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                    <h2 className="text-xl font-semibold">{employeeToEditId ? (isViewer ? 'View Employee Archive' : 'Edit Employee Archive') : 'Add New Employee Archive'}</h2>
                    <button onClick={onBack} className="text-gray-600 hover:text-gray-800">&larr; Back</button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-8">
                    <div>
                        <h3 className="text-lg font-semibold mb-4 text-blue-700">أولاً: بيانات الموظف / First: Employee Data</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-3"><label className="block text-sm font-medium">اختر الموظف / Select Employee</label>{employeeToEditId ? <input type="text" value={`${formData.name_en} (${formData.employeeNumber})`} className="mt-1 p-2 w-full border rounded-md bg-gray-100" readOnly /> : <SearchableEmployeeSelect onEmployeeSelect={handleEmployeeSelect} disabled={isViewer} />}</div>
                            <fieldset disabled={isFormLocked} className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                <div><label className="block text-sm">الاسم (انجليزي) / Name (EN):</label><input type="text" name="name_en" value={formData.name_en || ''} className={inputClassName} readOnly required /></div>
                                <div><label className="block text-sm">الاسم (عربي) / Name (AR):</label><input type="text" name="name_ar" value={formData.name_ar || ''} className={inputClassName} readOnly /></div>
                                <div><label className="block text-sm">الرقم الوظيفي / Employee ID:</label><input type="text" name="employeeNumber" value={formData.employeeNumber || ''} className={inputClassName} readOnly required /></div>
                                <div><label className="block text-sm">تاريخ التعيين / Hire Date:</label><input type="date" name="hireDate" value={formData.hireDate || ''} onChange={handleInputChange} readOnly={isViewer} className={inputClassName} /></div>
                                <div><label className="block text-sm">الوظيفة / Job Title:</label><input type="text" name="jobTitle" value={formData.jobTitle || ''} onChange={handleInputChange} readOnly={isViewer} className={inputClassName} /></div>
                                <div>
                                    <label className="block text-sm">الجنسية / Nationality:</label>
                                    <SearchableNationalitySelect
                                        value={formData.nationality || ''}
                                        onChange={handleNationalityChange}
                                        disabled={isViewer || isFormLocked}
                                        nationalities={nationalities}
                                    />
                                </div>
                                <div><label className="block text-sm">البريد الالكتروني / Email:</label><input type="email" name="email" value={formData.email || ''} onChange={handleInputChange} readOnly={isViewer} className={inputClassName} /></div>
                                <div><label className="block text-sm">الهاتف / Phone:</label><input type="tel" name="phone" value={formData.phone || ''} onChange={handleInputChange} readOnly={isViewer} className={inputClassName} /></div>
                                <div><label className="block text-sm">المسؤول المباشر / Manager:</label><input type="text" name="manager" value={formData.manager || ''} onChange={handleInputChange} readOnly={isViewer} className={inputClassName} /></div>
                                <div><label className="block text-sm">الإدارة / Department:</label><input type="text" name="department" value={formData.department || ''} onChange={handleInputChange} readOnly={isViewer} className={inputClassName} /></div>
                                <div><label className="block text-sm">القسم / Section:</label><input type="text" name="section" value={formData.section || ''} onChange={handleInputChange} readOnly={isViewer} className={inputClassName} /></div>
                                <div><label className="block text-sm">حالة الموظف / Employee Status:</label><select name="status_id" value={formData.status_id || ''} onChange={handleInputChange} disabled={true} className={selectClassName} required><option value="">-- Select --</option>{statuses.employee_status.map(s => <option key={s.system_id} value={s.system_id}>{s.name_arabic} / {s.name_english}</option>)}</select></div>
                            </fieldset>
                        </div>
                    </div>
                    <fieldset disabled={isFormLocked}>
                        <div>
                            <h3 className="text-lg font-semibold mb-4 text-blue-700">ثانياً: المستندات / Second: Documents</h3>
                            {employeeToEditId && existingDocuments.length > 0 && (
                                <div className="space-y-2 mb-4">
                                    <h4 className="text-sm font-semibold">المستندات الحالية / Existing Documents:</h4>
                                    {existingDocuments.map(doc => {
                                        const isWarrantDecision = warrantDecisionDocTypeId && doc.doc_type_id === warrantDecisionDocTypeId;
                                        return (
                                            <div key={doc.system_id} className="p-3 border rounded-md bg-gray-50 text-sm">
                                                <div className="flex justify-between items-center">
                                                    <span className="font-semibold">{doc.doc_name}</span>
                                                    <div className="flex items-center gap-4">
                                                        {doc.expiry && (<span className="text-xs text-gray-600 bg-gray-200 px-2 py-1 rounded">تنتهي / expires: {doc.expiry}</span>)}
                                                        <button type="button" title="View Document" onClick={() => setViewingDoc({ url: `${doc.docnumber}`, name: doc.doc_name })} className="text-gray-500 hover:text-gray-800"><img src={`${basePath}/eye-icon.svg`} alt="View" className="h-5 w-5" /></button>
                                                        {!isViewer && (<button type="button" title="Remove Document" onClick={() => handleDeleteExistingDoc(doc.system_id)} className="text-red-500/75 hover:text-red-700"><img src={`${basePath}/trash-icon.svg`} alt="Remove" className="h-5 w-5" /></button>)}
                                                    </div>
                                                </div>
                                                {isWarrantDecision && (
                                                    <div className="mt-2">
                                                        <label className="text-xs font-semibold text-gray-700">التشريع المرتبط / Related Legislation</label>
                                                        <div className="mt-1 p-2 border rounded-md bg-white max-h-32 overflow-y-auto space-y-1">
                                                            {legislations.map(leg => (
                                                                <label key={leg.system_id} className="flex items-center space-x-2 rtl:space-x-reverse cursor-pointer">
                                                                    <input type="checkbox" checked={doc.legislation_ids.includes(leg.system_id)} onChange={() => handleExistingDocLegislationChange(doc.system_id, leg.system_id)} className={checkboxClassName} disabled={isViewer} />
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
                            {!isViewer && (
                                <div className="space-y-4">
                                    {newDocuments.map((doc, index) => {
                                        const showExpiry = expiryDocTypeIds.has(parseInt(doc.doc_type_id, 10));
                                        const isWarrantDecision = warrantDecisionDocTypeId && doc.doc_type_id === warrantDecisionDocTypeId.toString();
                                        return (
                                            <div key={index} className="flex items-start justify-between p-3 border rounded-md bg-gray-50 space-x-4 rtl:space-x-reverse">
                                                <div className="flex-grow space-y-3">
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                                                        <div>
                                                            <label className="text-xs">نوع المستند / Document Type</label>
                                                            <select value={doc.doc_type_id} onChange={e => handleNewDocumentChange(index, 'doc_type_id', e.target.value)} className="p-2 w-full border rounded-md" required>
                                                                <option value="">-- اختر / Select --</option>
                                                                {docTypes.all_types.map(type =>
                                                                    <option
                                                                        key={type.system_id}
                                                                        value={type.system_id}
                                                                        disabled={
                                                                            usedDocTypeIds.has(type.system_id) &&
                                                                            type.system_id.toString() !== doc.doc_type_id
                                                                        }
                                                                    >
                                                                        {type.name}
                                                                    </option>
                                                                )}
                                                            </select>
                                                        </div>
                                                        <div><label className="text-xs">الملف / File</label><input id={`new-file-input-${index}`} type="file" onChange={e => handleNewDocumentChange(index, 'file', e.target.files ? e.target.files[0] : null)} className="p-1 w-full border rounded-md text-sm bg-white" accept="image/jpeg,image/png,application/pdf" required /></div>
                                                        <div>{showExpiry && (<><label className="text-xs">تاريخ الانتهاء / Expiry Date</label><input type="date" value={doc.expiry} onChange={e => handleNewDocumentChange(index, 'expiry', e.target.value)} className="p-2 w-full border rounded-md" required /></>)}</div>
                                                    </div>
                                                    {isWarrantDecision && (
                                                        <div className="mt-2">
                                                            <label className="text-xs font-semibold text-gray-700">التشريع المرتبط / Related Legislation</label>
                                                            <div className="mt-1 p-2 border rounded-md bg-white max-h-32 overflow-y-auto space-y-1">
                                                                {legislations.map(leg => (<label key={leg.system_id} className="flex items-center space-x-2 rtl:space-x-reverse cursor-pointer"><input type="checkbox" checked={doc.legislation_ids.includes(leg.system_id.toString())} onChange={() => handleNewDocumentChange(index, 'legislation_ids', leg.system_id.toString())} className="rounded" /><span className="text-sm">{leg.name}</span></label>))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <button type="button" onClick={() => removeNewDocumentRow(index)} className="text-gray-400 hover:text-red-600 font-bold text-2xl mt-5" title="Remove this document">&times;</button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {!isViewer && (<div className="mt-4"><button type="button" onClick={addNewDocumentRow} className="bg-green-500 text-white font-bold py-2 px-4 rounded-md hover:bg-green-600 disabled:bg-green-300 disabled:cursor-not-allowed" disabled={isFormLocked}>+ إضافة مستند جديد / Add New Document</button></div>)}
                        </div>
                    </fieldset>
                    {error && <div className="text-sm text-red-700 p-3 bg-red-100 rounded-md">{error}</div>}
                    {!isViewer && (<div className="flex justify-end pt-4"><button type="submit" className="bg-blue-600 text-white font-bold py-2 px-6 rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed" disabled={isSubmitting || isFormLocked}>{isSubmitting ? 'Saving...' : 'حفظ البيانات / Save Data'}</button></div>)}
                </form>
            </div>
        </>
    );
};

// --- Main Page Component ---
export default function DashboardPage() {
    const [view, setView] = useState<'dashboard' | 'form'>('dashboard');
    const [user, setUser] = useState<User | null>(null);
    const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null);
    const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);
    const router = useRouter();
    const [dataRefreshKey, setDataRefreshKey] = useState(0);

    useEffect(() => {
        fetch(`${basePath}/api/auth/pta-user`)
            .then(res => res.ok ? res.json() : Promise.reject())
            .then(data => data.user?.username ? setUser(data.user) : router.push('/login'))
            .catch(() => router.push('/login'));
    }, [router]);

    const handleFormSubmit = () => setDataRefreshKey(k => k + 1);
    const handleLogout = async () => { await fetch(`${basePath}/api/auth/logout`, { method: 'POST' }); router.push('/login'); };
    const handleEdit = (employee: ArchivedEmployee) => { if (employee.system_id) { setEditingEmployeeId(employee.system_id); setView('form'); } };
    const handleBackFromForm = () => { setEditingEmployeeId(null); setView('dashboard'); };

    const securityLevelClasses = useMemo(() => {
        if (!user) return '';
        return user.security_level === 'Editor'
            ? 'bg-blue-100 text-blue-800'
            : 'bg-gray-200 text-gray-800';
    }, [user]);

    if (!user) return <div className="flex items-center justify-center min-h-screen">Verifying session...</div>;

    return (
        <div className="min-h-screen bg-gray-50 text-gray-800">
            <header className="bg-white shadow-sm sticky top-0 z-10">
                <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-gray-900">نظام متابعة الضبطية القضائية / Judicial control monitoring system</h1>
                    <div className="flex items-center gap-4">
                        <div className="text-sm flex items-center gap-2">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${securityLevelClasses}`}>{user.security_level}</span>
                            <span className="font-semibold">{user.username}</span>
                        </div>
                        <button onClick={handleLogout} className="bg-red-500 text-white text-xs font-bold py-1 px-3 rounded-md hover:bg-red-600">تسجيل الخروج / Logout</button>
                    </div>
                </div>
            </header>
            <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {view === 'dashboard' ? (<DashboardView user={user} onAddNew={() => setView('form')} onBulkAdd={() => setIsBulkAddOpen(true)} onEdit={handleEdit} dataRefreshKey={dataRefreshKey} />) : (<EmployeeForm user={user} onBack={handleBackFromForm} onFormSubmit={handleFormSubmit} employeeToEditId={editingEmployeeId} />)}
                {isBulkAddOpen && <BulkAddModal onClose={() => setIsBulkAddOpen(false)} onUploadSuccess={handleFormSubmit} />}
            </main>
        </div>
    );
}

// --- Dashboard View Component ---
const DashboardView = ({ onAddNew, onBulkAdd, onEdit, dataRefreshKey, user }: { onAddNew: () => void; onBulkAdd: () => void; onEdit: (emp: ArchivedEmployee) => void; dataRefreshKey: number; user: User | null; }) => {
    const [employees, setEmployees] = useState<ArchivedEmployee[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [dashboardCounts, setDashboardCounts] = useState({ total_employees: 0, active_employees: 0, inactive_employees: 0, expiring_soon: 0 });
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string | null>(null);
    const [filterType, setFilterType] = useState<string | null>(null);
    const [activeCard, setActiveCard] = useState<string | null>('total');

    const isViewer = user?.security_level === 'Viewer';
    const getCardStatusBadgeClass = (statusClass: string) => ({ expired: 'status-badge status-expired', 'expiring-soon': 'status-badge status-expiring-soon', valid: 'status-badge status-valid' }[statusClass] || '');
    const getStatusBadgeClass = (status?: string | null) => ({ Active: 'status-badge status-active', Inactive: 'status-badge status-inactive', Disabled: 'status-badge status-disabled' }[status || ''] || 'status-badge');

    useEffect(() => {
        fetch(`${basePath}/api/dashboard_counts`).then(res => res.json()).then(setDashboardCounts); // Add basePath
    }, [dataRefreshKey]);

    useEffect(() => {
        setIsLoading(true);
        const params = new URLSearchParams();
        if (searchTerm) params.append('search', searchTerm);
        if (statusFilter) params.append('status', statusFilter);
        if (filterType) params.append('filter_type', filterType);
        fetch(`${basePath}/api/employees?${params.toString()}`) // Add basePath
            .then(res => res.json())
            .then((data: ApiEmployeeResponse) => { if (data && Array.isArray(data.employees)) setEmployees(data.employees); setIsLoading(false); })
            .catch(() => setIsLoading(false));
    }, [dataRefreshKey, searchTerm, statusFilter, filterType]);

    const handleCardClick = (type: string | null, status: string | null, cardName: string) => {
        setFilterType(type);
        setStatusFilter(status);
        setActiveCard(cardName);
    }

    const cardBaseClasses = "p-4 rounded-lg text-center border cursor-pointer hover:bg-opacity-80 transition";
    const activeCardClasses = "ring-2 ring-blue-500 ring-offset-2";

    return (
        <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                <h2 className="text-xl font-bold">لوحة المعلومات / Dashboard</h2>
                {!isViewer && (
                    <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                        <button onClick={onBulkAdd} className="w-full sm:w-auto bg-green-600 text-white font-bold py-2 px-4 rounded-md hover:bg-green-700">
                            + إضافة دفعة / Bulk Add
                        </button>
                        <button onClick={onAddNew} className="w-full sm:w-auto bg-blue-600 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-700">
                            + إضافة موظف جديد / Add New Employee
                        </button>
                    </div>
                )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div onClick={() => handleCardClick(null, null, 'total')} className={`${cardBaseClasses} bg-blue-50 hover:bg-blue-100 ${activeCard === 'total' ? activeCardClasses : ''}`}>
                    <p className="text-sm font-semibold text-blue-800">إجمالي الموظفين / Total Employees</p>
                    <h3 className="text-3xl font-bold text-blue-900 mt-2">{dashboardCounts.total_employees}</h3>
                </div>
                <div onClick={() => handleCardClick('has_warrant', 'Active', 'active')} className={`${cardBaseClasses} bg-green-50 hover:bg-green-100 ${activeCard === 'active' ? activeCardClasses : ''}`}>
                    <p className="text-sm font-semibold text-green-800">الموظفين الفعالين / Active Employees</p>
                    <h3 className="text-3xl font-bold text-green-900 mt-2">{dashboardCounts.active_employees}</h3>
                </div>
                <div onClick={() => handleCardClick('no_warrant', 'Inactive', 'inactive')} className={`${cardBaseClasses} bg-red-50 hover:bg-red-100 ${activeCard === 'inactive' ? activeCardClasses : ''}`}>
                    <p className="text-sm font-semibold text-red-800">الموظفين غير الفعالين / Inactive Users</p>
                    <h3 className="text-3xl font-bold text-red-900 mt-2">{dashboardCounts.inactive_employees}</h3>
                </div>
                <div onClick={() => handleCardClick('expiring_soon_or_expired', null, 'expiring')} className={`${cardBaseClasses} bg-yellow-50 hover:bg-yellow-100 ${activeCard === 'expiring' ? activeCardClasses : ''}`}>
                    <p className="text-sm font-semibold text-yellow-800">مستندات ستنتهي قريبًا أو منتهية الصلاحية / Expiring Soon or Expired</p>
                    <h3 className="text-3xl font-bold text-yellow-900 mt-2">{dashboardCounts.expiring_soon}</h3>
                </div>
            </div>
            <div className="mb-6"><input type="text" placeholder="ابحث بالاسم، الرقم الوظيفي... / Search by Name, Employee No..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-2 border rounded-md" /></div>
            <div className="overflow-x-auto">
                <table className="w-full table-fixed border-collapse">
                    <thead className="bg-gray-100 border-b-2 border-gray-200">
                        <tr>
                            <th className="p-3 w-16 font-bold text-sm text-right">م / #</th>
                            <th className="p-3 w-40 font-bold text-sm text-right">الرقم الوظيفي / Emp. ID</th>
                            <th className="p-3 font-bold text-sm text-right">الاسم / Name</th>
                            <th className="p-3 font-bold text-sm text-right">الإدارة/القسم / Dept./Section</th>
                            <th className="p-3 w-40 font-bold text-sm text-right">حالة الموظف / Status</th>
                            <th className="p-3 w-48 font-bold text-sm text-right">حالة الضبطية / Warrant Status</th>
                            <th className="p-3 w-48 font-bold text-sm text-right">حالة البطاقة / Card Status</th>
                            <th className="p-3 w-48 font-bold text-sm text-right">انتهاء البطاقة / Card Expiry</th>
                            <th className="p-3 w-40 font-bold text-sm text-right">إجراءات / Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (<tr><td colSpan={9} className="text-center p-10">Loading...</td></tr>) : employees.length > 0 ? (employees.map((emp, index) => (
                            <tr key={emp.system_id} className="border-b hover:bg-gray-50">
                                <td className="p-3 text-sm text-right">{index + 1}</td>
                                <td className="p-3 text-sm text-right whitespace-nowrap">{emp.empno}</td>
                                <td className="p-3 text-sm font-semibold text-blue-600 text-right">{emp.fullname_en}</td>
                                <td className="p-3 text-sm text-right">{emp.department} / {emp.section || 'N/A'}</td>
                                <td className="p-3 text-sm text-right"><span className={getStatusBadgeClass(emp.status_en)}>{emp.status_ar || 'N/A'}</span></td>
                                <td className="p-3 text-sm text-right whitespace-nowrap">{emp.warrant_status}</td>
                                <td className="p-3 text-sm text-right whitespace-nowrap">{emp.card_status}</td>
                                <td className="p-3 text-sm text-right whitespace-nowrap">{emp.card_expiry !== 'N/A' && (<span className={getCardStatusBadgeClass(emp.card_status_class)}>{emp.card_expiry}</span>)}{emp.card_expiry === 'N/A' && emp.card_expiry}</td>
                                <td className="p-3 text-sm text-right">
                                    <button onClick={() => onEdit(emp)} className="text-blue-500 hover:underline">{isViewer ? 'عرض / View' : 'تعديل / Edit'}</button>
                                </td>
                            </tr>
                        ))) : (<tr><td colSpan={9} className="text-center p-10 text-gray-500">No employees have been archived yet.</td></tr>)}
                    </tbody>
                </table>
            </div>
        </div>
    );
};