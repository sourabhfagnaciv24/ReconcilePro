import { useEffect, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import './App.css';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function App() {
  const [token, setToken] = useState(
    localStorage.getItem('reconcilepro_token') || ''
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [orders, setOrders] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [claims, setClaims] = useState([]);
  const [summary, setSummary] = useState(null);
  const [results, setResults] = useState([]);

  const [bankLedger, setBankLedger] = useState(
    () => localStorage.getItem('reconcilepro_bankLedger') || 'Bank Account'
  );

  const [marketplaceLedger, setMarketplaceLedger] = useState(
    () =>
      localStorage.getItem('reconcilepro_marketplaceLedger') ||
      'Marketplace Receivable'
  );

  const [voucherType, setVoucherType] = useState(
    () => localStorage.getItem('reconcilepro_voucherType') || 'Receipt'
  );

  const [exportFilter, setExportFilter] = useState('all');

  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [claimGenerating, setClaimGenerating] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [orderPreview, setOrderPreview] = useState([]);
  const [settlementPreview, setSettlementPreview] = useState([]);
  const [csvErrors, setCsvErrors] = useState([]);
  const [orderFileName, setOrderFileName] = useState('');
  const [settlementFileName, setSettlementFileName] = useState('');

  const [rawCsv, setRawCsv] = useState(null);
  const [aiMapping, setAiMapping] = useState(null);

  const [orderForm, setOrderForm] = useState({
    externalOrderId: '',
    channel: 'Amazon',
    orderAmount: '',
    expectedSettlement: ''
  });

  const [settlementForm, setSettlementForm] = useState({
    externalOrderId: '',
    amount: '',
    settlementDate: new Date().toISOString().slice(0, 10),
    sourceFile: 'manual_entry'
  });

  const [claimForm, setClaimForm] = useState({
    externalOrderId: '',
    amount: '',
    reason: ''
  });

  // ---------------- API REQUEST ----------------

  async function apiRequest(path, method = 'GET', body = null) {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || data.error?.message || 'Something went wrong'
      );
    }

    return data;
  }

  // ---------------- LOGIN ----------------

  async function login(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      localStorage.setItem('reconcilepro_token', data.token);
      setToken(data.token);
      setMessage('Login successful');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem('reconcilepro_token');
    setToken('');
    setOrders([]);
    setSettlements([]);
    setClaims([]);
    setSummary(null);
    setResults([]);
    setRawCsv(null);
    setAiMapping(null);
  }

  // ---------------- LOAD DASHBOARD ----------------

  async function loadDashboard() {
    setLoading(true);
    setError('');

    try {
      const [orderData, settlementData, claimData, resultData] =
        await Promise.all([
          apiRequest('/orders'),
          apiRequest('/settlements'),
          apiRequest('/claims'),
          apiRequest('/reconciliation/results')
        ]);

      setOrders(orderData.orders || []);
      setSettlements(settlementData.settlements || []);
      setClaims(claimData.claims || []);
      setResults(resultData.results || []);
    } catch (err) {
      setError(err.message);

      if (
        err.message.toLowerCase().includes('token') ||
        err.message.toLowerCase().includes('authentication')
      ) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) loadDashboard();
  }, [token]);

  // ---------------- SAVE TALLY SETTINGS ----------------

  useEffect(() => {
    localStorage.setItem('reconcilepro_bankLedger', bankLedger);
    localStorage.setItem(
      'reconcilepro_marketplaceLedger',
      marketplaceLedger
    );
    localStorage.setItem('reconcilepro_voucherType', voucherType);
  }, [bankLedger, marketplaceLedger, voucherType]);

  // ---------------- CREATE ORDER ----------------

  async function createOrder(e) {
    e.preventDefault();
    setError('');
    setMessage('');

    try {
      await apiRequest('/orders', 'POST', {
        ...orderForm,
        orderAmount: Number(orderForm.orderAmount),
        expectedSettlement: Number(orderForm.expectedSettlement)
      });

      setMessage('Order created successfully');

      setOrderForm({
        externalOrderId: '',
        channel: 'Amazon',
        orderAmount: '',
        expectedSettlement: ''
      });

      await loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  }

  // ---------------- CREATE SETTLEMENT ----------------

  async function createSettlement(e) {
    e.preventDefault();
    setError('');
    setMessage('');

    try {
      await apiRequest('/settlements', 'POST', {
        ...settlementForm,
        amount: Number(settlementForm.amount)
      });

      setMessage('Settlement saved successfully');

      setSettlementForm({
        externalOrderId: '',
        amount: '',
        settlementDate: new Date().toISOString().slice(0, 10),
        sourceFile: 'manual_entry'
      });

      await loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  }

  // ---------------- CSV VALIDATION ----------------

  function validateCsvRows(rows, type) {
    const validRows = [];
    const errors = [];
    const seenOrderIds = new Set();

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const externalOrderId = String(
        row.externalOrderId || ''
      ).trim();

      const rowErrors = [];

      if (!externalOrderId) {
        rowErrors.push('Missing Order ID');
      }

      const amountFields = type === 'orders'
        ? [
            ['Order Amount', row.orderAmount],
            ['Expected Settlement', row.expectedSettlement]
          ]
        : [['Settlement Amount', row.amount]];

      const normalizedAmounts = {};

      amountFields.forEach(([label, value]) => {
        const cleaned = String(value ?? '').replace(/[₹,\s]/g, '');
        const numericValue = Number(cleaned);

        if (cleaned === '' || !Number.isFinite(numericValue)) {
          rowErrors.push(`${label} is missing or invalid`);
        } else if (numericValue < 0) {
          rowErrors.push(`${label} cannot be negative`);
        } else {
          normalizedAmounts[label] = numericValue;
        }
      });

      if (type === 'settlements') {
        const dateValue = String(
          row.settlementDate || ''
        ).trim();

        if (!dateValue || Number.isNaN(Date.parse(dateValue))) {
          rowErrors.push('Invalid or missing Settlement Date');
        }
      }

      if (type === 'orders' && externalOrderId) {
        const normalizedId = externalOrderId.toLowerCase();

        if (seenOrderIds.has(normalizedId)) {
          rowErrors.push('Duplicate Order ID in this CSV');
        } else {
          seenOrderIds.add(normalizedId);
        }
      }

      if (rowErrors.length) {
        errors.push({
          row: rowNumber,
          reasons: rowErrors
        });
        return;
      }

      if (type === 'orders') {
        validRows.push({
          ...row,
          externalOrderId,
          orderAmount: normalizedAmounts['Order Amount'],
          expectedSettlement:
            normalizedAmounts['Expected Settlement']
        });
      } else {
        validRows.push({
          ...row,
          externalOrderId,
          amount: normalizedAmounts['Settlement Amount']
        });
      }
    });

    return { validRows, errors };
  }

  // ---------------- READ CSV ----------------

  function readCsv(file, type) {
    if (!file) return;

    setError('');
    setMessage('');
    setAiMapping(null);
    setCsvErrors([]);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,

      complete: (parsed) => {
        const rows = parsed.data;

        if (!rows.length) {
          setError('The selected CSV file is empty.');
          return;
        }

        const headers = Object.keys(rows[0]).map(h => h.trim());

        setRawCsv({
          type,
          headers,
          rows: rows.slice(0, 10000),
          fileName: file.name
        });

        const findColumn = (possibleNames) =>
          headers.find(header =>
            possibleNames.includes(header.toLowerCase().trim())
          );

        let mapped;

        if (type === 'orders') {
          const idCol = findColumn([
            'externalorderid',
            'external_order_id',
            'external order id',
            'order_id',
            'orderid',
            'order id'
          ]);

          const channelCol = findColumn([
            'channel',
            'marketplace',
            'platform'
          ]);

          const amountCol = findColumn([
            'orderamount',
            'order_amount',
            'order amount',
            'total_amount'
          ]);

          const expectedCol = findColumn([
            'expectedsettlement',
            'expected_settlement',
            'expected settlement',
            'expected_amount'
          ]);

          if (!idCol || !amountCol || !expectedCol) {
            setOrderPreview([]);
            setError(
              'Some required columns are not recognized. Use AI Column Mapping to identify them.'
            );
            return;
          }

          mapped = rows.map(row => ({
            externalOrderId: String(row[idCol] || '').trim(),
            channel: channelCol ? row[channelCol] || 'Other' : 'Other',
            orderAmount: row[amountCol],
            expectedSettlement: row[expectedCol]
          }));

          const checked = validateCsvRows(mapped, 'orders');

          setOrderPreview(checked.validRows);
          setOrderFileName(file.name);
          setSettlementPreview([]);
          setCsvErrors(checked.errors);

          setMessage(
            `Valid rows: ${checked.validRows.length}. Invalid rows: ${checked.errors.length}.`
          );
        } else {
          const idCol = findColumn([
            'externalorderid',
            'external_order_id',
            'external order id',
            'order_id',
            'orderid',
            'order id'
          ]);

          const amountCol = findColumn([
            'amount',
            'settlement_amount',
            'received_amount',
            'received amount',
            'paid_amount'
          ]);

          const dateCol = findColumn([
            'settlementdate',
            'settlement_date',
            'settlement date',
            'date',
            'payment_date'
          ]);

          if (!idCol || !amountCol || !dateCol) {
            setSettlementPreview([]);
            setError(
              'Some required columns are not recognized. Use AI Column Mapping to identify them.'
            );
            return;
          }

          mapped = rows.map(row => ({
            externalOrderId: String(row[idCol] || '').trim(),
            amount: row[amountCol],
            settlementDate: row[dateCol],
            sourceFile: file.name
          }));

          const checked = validateCsvRows(mapped, 'settlements');

          setSettlementPreview(checked.validRows);
          setSettlementFileName(file.name);
          setOrderPreview([]);
          setCsvErrors(checked.errors);

          setMessage(
            `Valid rows: ${checked.validRows.length}. Invalid rows: ${checked.errors.length}.`
          );
        }
      },

      error: () => setError('Could not read the CSV file.')
    });
  }

  // ---------------- AI COLUMN MAPPING ----------------

  async function suggestAiMapping() {
    if (!rawCsv) {
      setError('Please select a CSV file first.');
      return;
    }

    setAiLoading(true);
    setError('');
    setMessage('');
    setAiMapping(null);

    try {
      const data = await apiRequest(
        '/ai/suggest-mapping',
        'POST',
        {
          fileType: rawCsv.type,
          headers: rawCsv.headers,
          sampleRows: rawCsv.rows.slice(0, 20)
        }
      );

      if (!data.success || !data.mapping) {
        throw new Error(data.message || 'AI mapping failed.');
      }

      setAiMapping(data);
      setMessage('AI suggestions generated successfully. Review them below.');
    } catch (err) {
      setError(err.message);
    } finally {
      setAiLoading(false);
    }
  }

  // ---------------- APPLY AI MAPPING ----------------

  function applyAiMapping() {
    if (!rawCsv || !aiMapping?.mapping) {
      setError('Generate AI suggestions first.');
      return;
    }

    const mapping = aiMapping.mapping;
    const headers = rawCsv.headers;

    function normalize(value) {
      return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
    }

    function findSourceColumn(target, aliases = []) {
      const targets = [target, ...aliases].map(normalize);

      for (const key of [target, ...aliases]) {
        let value = mapping[key];

        if (value && typeof value === 'object') {
          value =
            value.column ||
            value.sourceColumn ||
            value.header ||
            value.field;
        }

        if (
          typeof value === 'string' &&
          headers.includes(value)
        ) {
          return value;
        }
      }

      for (const [source, destination] of Object.entries(mapping)) {
        let value = destination;

        if (value && typeof value === 'object') {
          value =
            value.field ||
            value.target ||
            value.applicationField;
        }

        if (
          headers.includes(source) &&
          typeof value === 'string' &&
          targets.includes(normalize(value))
        ) {
          return source;
        }
      }

      return headers.find(header =>
        targets.includes(normalize(header))
      );
    }

    let mappedRows;

    if (rawCsv.type === 'orders') {
      const idCol = findSourceColumn('externalOrderId', [
        'orderId',
        'order_id',
        'external_order_id'
      ]);

      const channelCol = findSourceColumn('channel', [
        'marketplace',
        'platform'
      ]);

      const amountCol = findSourceColumn('orderAmount', [
        'order_amount',
        'total_amount'
      ]);

      const expectedCol = findSourceColumn('expectedSettlement', [
        'expected_settlement',
        'expected_amount'
      ]);

      if (!idCol || !amountCol || !expectedCol) {
        setError(
          'AI mapping is missing a required order field. Check the suggestions.'
        );
        return;
      }

      mappedRows = rawCsv.rows.map(row => ({
        externalOrderId: String(row[idCol] || '').trim(),
        channel: channelCol ? row[channelCol] || 'Other' : 'Other',
        orderAmount: row[amountCol],
        expectedSettlement: row[expectedCol]
      }));

      const checked = validateCsvRows(mappedRows, 'orders');

      setOrderPreview(checked.validRows);
      setCsvErrors(checked.errors);
      setOrderFileName(rawCsv.fileName);
      setSettlementPreview([]);
    } else {
      const idCol = findSourceColumn('externalOrderId', [
        'orderId',
        'order_id',
        'external_order_id'
      ]);

      const amountCol = findSourceColumn('amount', [
        'settlement_amount',
        'received_amount',
        'paid_amount'
      ]);

      const dateCol = findSourceColumn('settlementDate', [
        'settlement_date',
        'payment_date',
        'date'
      ]);

      if (!idCol || !amountCol || !dateCol) {
        setError(
          'AI mapping is missing a required settlement field. Check the suggestions.'
        );
        return;
      }

      mappedRows = rawCsv.rows.map(row => ({
        externalOrderId: String(row[idCol] || '').trim(),
        amount: row[amountCol],
        settlementDate: row[dateCol],
        sourceFile: rawCsv.fileName
      }));

      const checked = validateCsvRows(mappedRows, 'settlements');

      setSettlementPreview(checked.validRows);
      setCsvErrors(checked.errors);
      setSettlementFileName(rawCsv.fileName);
      setOrderPreview([]);
    }

    setMessage(
      'AI mapping applied. Review valid rows and validation errors before importing.'
    );
  }

  // ---------------- IMPORT CSV ----------------

  async function importCsv(type) {
    const isOrders = type === 'orders';
    const rows = isOrders ? orderPreview : settlementPreview;

    if (!rows.length) {
      setError('There are no valid rows to import.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const data = await apiRequest(
        isOrders ? '/orders/import' : '/settlements/import',
        'POST',
        isOrders ? { orders: rows } : { settlements: rows }
      );

      setMessage(
        `${data.message}. Imported: ${data.importedCount}.` +
        (data.skippedCount
          ? ` Duplicates skipped: ${data.skippedCount}.`
          : '') +
        (data.invalidRows?.length
          ? ` Invalid rows: ${data.invalidRows.length}.`
          : '')
      );

      if (isOrders) {
        setOrderPreview([]);
        setOrderFileName('');
      } else {
        setSettlementPreview([]);
        setSettlementFileName('');
      }

      setRawCsv(null);
      setAiMapping(null);
      setCsvErrors([]);

      await loadDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ---------------- RECONCILIATION ----------------

  async function runReconciliation() {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const data = await apiRequest('/reconciliation/run', 'POST');

      setSummary(data.summary);
      setResults(data.results || []);

      setMessage('Reconciliation completed successfully');

      await loadDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ---------------- TALLY CSV EXPORT ----------------

  function exportTallyCsv() {
    if (results.length === 0) {
      setError('Run reconciliation before exporting.');
      return;
    }

    const tallyRows = results.map(item => {
      const matchingOrder = orders.find(
        order =>
          order.id === item.orderId ||
          order.externalOrderId === item.orderId ||
          order.externalOrderId === item.externalOrderId
      );

      return {
        'Order ID':
          item.externalOrderId ||
          matchingOrder?.externalOrderId ||
          item.orderId ||
          '',

        'Channel': matchingOrder?.channel || '',

        'Order Amount': Number(matchingOrder?.orderAmount || 0),

        'Expected Settlement':
          Number(item.expectedSettlement || 0),

        'Received Settlement':
          Number(item.receivedSettlement || 0),

        'Difference': Number(item.difference || 0),

        'Status': item.status || ''
      };
    });

    const csv = Papa.unparse(tallyRows);

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;'
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `ReconcilePro_Tally_Export_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);

    setMessage('Reconciliation CSV exported successfully.');
  }

  // ---------------- EXCEL REPORT EXPORT ----------------

  function exportExcelReport() {
    setError('');
    setMessage('');

    if (
      orders.length === 0 &&
      settlements.length === 0 &&
      results.length === 0 &&
      claims.length === 0
    ) {
      setError('There is no data available to export.');
      return;
    }

    try {
      const workbook = XLSX.utils.book_new();

      // Reconciliation Sheet
      const reconciliationRows = results.map(item => {
        const matchingOrder = orders.find(
          order =>
            order.id === item.orderId ||
            order.externalOrderId === item.orderId ||
            order.externalOrderId === item.externalOrderId
        );

        return {
          'Order ID':
            item.externalOrderId ||
            matchingOrder?.externalOrderId ||
            item.orderId ||
            '',
          'Channel': matchingOrder?.channel || '',
          'Order Amount': Number(matchingOrder?.orderAmount || 0),
          'Expected Settlement': Number(item.expectedSettlement || 0),
          'Received Settlement': Number(item.receivedSettlement || 0),
          'Difference': Number(item.difference || 0),
          'Status': item.status || ''
        };
      });

      const reconciliationSheet = XLSX.utils.json_to_sheet(
        reconciliationRows.length
          ? reconciliationRows
          : [{ Message: 'No reconciliation results available' }]
      );

      XLSX.utils.book_append_sheet(
        workbook,
        reconciliationSheet,
        'Reconciliation'
      );

      // Orders Sheet
      const orderRows = orders.map(order => ({
        'Order ID': order.externalOrderId || '',
        'Channel': order.channel || '',
        'Order Amount': Number(order.orderAmount || 0),
        'Expected Settlement': Number(order.expectedSettlement || 0),
        'Status': order.status || ''
      }));

      const ordersSheet = XLSX.utils.json_to_sheet(
        orderRows.length
          ? orderRows
          : [{ Message: 'No orders available' }]
      );

      XLSX.utils.book_append_sheet(workbook, ordersSheet, 'Orders');

      // Settlements Sheet
      const settlementRows = settlements.map(item => ({
        'Order ID': item.externalOrderId || '',
        'Received Amount': Number(item.amount || 0),
        'Settlement Date': item.settlementDate
          ? new Date(item.settlementDate).toLocaleDateString()
          : '',
        'Source File': item.sourceFile || 'Manual'
      }));

      const settlementsSheet = XLSX.utils.json_to_sheet(
        settlementRows.length
          ? settlementRows
          : [{ Message: 'No settlements available' }]
      );

      XLSX.utils.book_append_sheet(
        workbook,
        settlementsSheet,
        'Settlements'
      );

      // Claims Sheet
      const claimRows = claims.map(claim => ({
        'Order ID': claim.order?.externalOrderId || '',
        'Claim Amount': Number(claim.amount || 0),
        'Reason': claim.reason || '',
        'Status': claim.status || '',
        'Created At': claim.createdAt
          ? new Date(claim.createdAt).toLocaleDateString()
          : ''
      }));

      const claimsSheet = XLSX.utils.json_to_sheet(
        claimRows.length
          ? claimRows
          : [{ Message: 'No claims available' }]
      );

      XLSX.utils.book_append_sheet(workbook, claimsSheet, 'Claims');

      // Summary Sheet
      const summaryRows = [
        { Metric: 'Total Orders', Value: orders.length },
        { Metric: 'Total Settlements', Value: settlements.length },
        { Metric: 'Matched Orders', Value: matchedOrders },
        { Metric: 'Mismatched Orders', Value: mismatchedOrders },
        { Metric: 'Pending Orders', Value: pendingOrders },
        { Metric: 'Expected Settlement Total', Value: expectedTotal },
        { Metric: 'Received Settlement Total', Value: receivedTotal },
        {
          Metric: 'Difference',
          Value: expectedTotal - receivedTotal
        },
        {
          Metric: 'Money at Risk',
          Value: Number(summary?.moneyAtRisk || 0)
        },
        { Metric: 'Total Claims', Value: claims.length },
        { Metric: 'Unknown Orders', Value: exportUnknownCount }
      ];

      const summarySheet = XLSX.utils.json_to_sheet(summaryRows);

      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

      // Download Excel file
      const today = new Date().toISOString().slice(0, 10);

      XLSX.writeFile(
        workbook,
        `ReconcilePro_Report_${today}.xlsx`
      );

      setMessage('Excel report downloaded successfully.');
    } catch (err) {
      setError(`Excel export failed: ${err.message}`);
    }
  }

  // ---------------- PDF REPORT EXPORT ----------------

  function exportPDFReport() {
    setError('');
    setMessage('');

    if (results.length === 0) {
      setError('Please run reconciliation before downloading the PDF.');
      return;
    }

    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      doc.setFontSize(20);
      doc.text('ReconcilePro', 14, 18);

      doc.setFontSize(13);
      doc.text('Reconciliation Report', 14, 27);

      doc.setFontSize(9);
      doc.text(
        `Generated: ${new Date().toLocaleString()}`,
        14,
        34
      );

      const tableData = results.map(item => {
        const matchingOrder = orders.find(
          order =>
            order.id === item.orderId ||
            order.externalOrderId === item.orderId ||
            order.externalOrderId === item.externalOrderId
        );

        return [
          item.externalOrderId ||
            matchingOrder?.externalOrderId ||
            item.orderId ||
            '',
          matchingOrder?.channel || '',
          Number(matchingOrder?.orderAmount || 0).toFixed(2),
          Number(item.expectedSettlement || 0).toFixed(2),
          Number(item.receivedSettlement || 0).toFixed(2),
          Number(item.difference || 0).toFixed(2),
          item.status || ''
        ];
      });

      autoTable(doc, {
        startY: 40,
        head: [[
          'Order ID',
          'Channel',
          'Order Amount',
          'Expected',
          'Received',
          'Difference',
          'Status'
        ]],
        body: tableData,
        theme: 'grid',
        styles: {
          fontSize: 8,
          cellPadding: 3
        },
        headStyles: {
          fillColor: [40, 60, 100]
        }
      });

      let finalY = doc.lastAutoTable.finalY + 12;

      if (finalY + 55 > doc.internal.pageSize.getHeight() - 10) {
        doc.addPage();
        finalY = 20;
      }

      doc.setFontSize(11);
      doc.text(`Total Orders: ${results.length}`, 14, finalY);
      doc.text(`Matched Orders: ${matchedOrders}`, 14, finalY + 8);
      doc.text(`Mismatched Orders: ${mismatchedOrders}`, 14, finalY + 16);
      doc.text(`Pending Orders: ${pendingOrders}`, 14, finalY + 24);

      doc.text(
        `Expected Settlement: Rs. ${expectedTotal.toFixed(2)}`,
        14,
        finalY + 32
      );

      doc.text(
        `Received Settlement: Rs. ${receivedTotal.toFixed(2)}`,
        14,
        finalY + 40
      );

      doc.text(
        `Money at Risk: Rs. ${Number(summary?.moneyAtRisk || 0).toFixed(2)}`,
        14,
        finalY + 48
      );

      const today = new Date().toISOString().slice(0, 10);

      doc.save(`ReconcilePro_Report_${today}.pdf`);

      setMessage('PDF report downloaded successfully.');
    } catch (err) {
      setError(`PDF export failed: ${err.message}`);
    }
  }

  // ---------------- TALLY XML EXPORT ----------------

  async function exportTallyXml() {
    setError('');
    setMessage('');

    if (
      !bankLedger.trim() ||
      !marketplaceLedger.trim() ||
      !voucherType.trim()
    ) {
      setError('Please fill in all Tally export settings.');
      return;
    }

    if (
      bankLedger.trim().toLowerCase() ===
      marketplaceLedger.trim().toLowerCase()
    ) {
      setError(
        'Bank and marketplace ledger names must be different.'
      );
      return;
    }

    try {
      const params = new URLSearchParams({
        bankLedger: bankLedger.trim(),
        marketplaceLedger: marketplaceLedger.trim(),
        voucherType: voucherType.trim(),
        exportFilter
      });

      const response = await fetch(
        `${API}/reconciliation/tally-xml?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        let errorMessage = 'Could not export Tally XML.';

        try {
          const data = await response.json();
          errorMessage = data.message || errorMessage;
        } catch {
          // Keep default error message.
        }

        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = 'ReconcilePro_Tally_Import.xml';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setMessage(
        'Tally XML exported successfully using your selected settings.'
      );
    } catch (err) {
      setError(err.message);
    }
  }

  // ---------------- CREATE CLAIM ----------------

  async function createClaim(e) {
    e.preventDefault();
    setError('');
    setMessage('');

    try {
      await apiRequest('/claims', 'POST', {
        ...claimForm,
        amount: Number(claimForm.amount)
      });

      setMessage('Claim submitted successfully');

      setClaimForm({
        externalOrderId: '',
        amount: '',
        reason: ''
      });

      await loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  }

  // ---------------- AUTOMATIC CLAIM GENERATION ----------------

  async function generateClaim(externalOrderId) {
    if (!externalOrderId) {
      setError('Could not identify the external order ID.');
      return;
    }

    setClaimGenerating(externalOrderId);
    setError('');
    setMessage('');

    try {
      const data = await apiRequest(
        `/claims/generate/${encodeURIComponent(externalOrderId)}`,
        'POST'
      );

      setMessage(
        `Claim generated successfully for ${externalOrderId}: ${money(data.claim?.amount)}`
      );

      await loadDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setClaimGenerating('');
    }
  }

  // ---------------- UPDATE CLAIM ----------------

  async function updateClaimStatus(id, status) {
    setError('');

    try {
      await apiRequest(`/claims/${id}/status`, 'PATCH', { status });
      setMessage('Claim status updated');
      await loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  }

  // ---------------- DELETE SETTLEMENT ----------------

  async function deleteSettlement(id) {
    const confirmed = window.confirm(
      'Are you sure you want to delete this settlement?'
    );

    if (!confirmed) return;

    setLoading(true);
    setError('');
    setMessage('');

    try {
      await apiRequest(`/settlements/${id}`, 'DELETE');

      const data = await apiRequest('/reconciliation/run', 'POST');
      setSummary(data.summary);
      setResults(data.results || []);

      await loadDashboard();
      setMessage('Settlement deleted and reconciliation updated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ---------------- MONEY FORMAT ----------------

  const money = (value) =>
    `₹${Number(value || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;

  // ---------------- DASHBOARD ANALYTICS ----------------

  const matchedOrders = results.filter(
    item => String(item.status || '').toUpperCase() === 'MATCHED'
  ).length;

  const mismatchedOrders = results.filter(item =>
    ['MISMATCH', 'MISMATCHED'].includes(
      String(item.status || '').toUpperCase()
    )
  ).length;

  const pendingOrders = results.filter(
    item => String(item.status || '').toUpperCase() === 'PENDING'
  ).length;

  const expectedTotal = orders.reduce(
    (total, order) => total + Number(order.expectedSettlement || 0),
    0
  );

  const receivedTotal = settlements.reduce(
    (total, settlement) => total + Number(settlement.amount || 0),
    0
  );

  const financialMax = Math.max(expectedTotal, receivedTotal, 1);

  // ---------------- TALLY EXPORT SUMMARY ----------------

  const settlementGroups = {};

  settlements.forEach(settlement => {
    const orderId = String(settlement.externalOrderId || '')
      .trim()
      .toLowerCase();

    if (!settlementGroups[orderId]) {
      settlementGroups[orderId] = {
        total: 0,
        settlements: []
      };
    }

    settlementGroups[orderId].total += Number(settlement.amount || 0);
    settlementGroups[orderId].settlements.push(settlement);
  });

  const exportOrderStatus = {};

  Object.entries(settlementGroups).forEach(([orderId, group]) => {
    const order = orders.find(
      item =>
        String(item.externalOrderId || '').trim().toLowerCase() === orderId
    );

    if (!order) {
      exportOrderStatus[orderId] = 'UNKNOWN';
      return;
    }

    const expected = Number(order.expectedSettlement || 0);

    exportOrderStatus[orderId] =
      Math.abs(expected - group.total) <= 0.01
        ? 'MATCHED'
        : 'MISMATCH';
  });

  const filteredSettlements = settlements.filter(settlement => {
    const orderId = String(settlement.externalOrderId || '')
      .trim()
      .toLowerCase();

    const status = exportOrderStatus[orderId];

    if (exportFilter === 'matched') return status === 'MATCHED';

    if (exportFilter === 'excludeUnknown') return status !== 'UNKNOWN';

    return true;
  });

  const exportTotal = filteredSettlements.reduce(
    (total, item) => total + Number(item.amount || 0),
    0
  );

  const exportMatchedCount = Object.values(exportOrderStatus)
    .filter(status => status === 'MATCHED').length;

  const exportMismatchCount = Object.values(exportOrderStatus)
    .filter(status => status === 'MISMATCH').length;

  const exportUnknownCount = Object.values(exportOrderStatus)
    .filter(status => status === 'UNKNOWN').length;

  // ---------------- LOGIN PAGE ----------------

  if (!token) {
    return (
      <div className="login-page">
        <form className="login-card" onSubmit={login}>
          <h1>ReconcilePro</h1>
          <p>Order and payment reconciliation platform</p>

          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />

          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />

          <button disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>

          {error && <p className="error">{error}</p>}
        </form>
      </div>
    );
  }

  // ---------------- MAIN DASHBOARD ----------------

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <h2>ReconcilePro</h2>
        <p className="sidebar-subtitle">D2C Finance Platform</p>

        <nav>
          <a href="#dashboard">Dashboard</a>
          <a href="#uploads">CSV Imports</a>
          <a href="#orders">Orders</a>
          <a href="#settlements">Settlements</a>
          <a href="#claims">Claims</a>
          <a href="#tally-settings">Tally Settings</a>
        </nav>

        <button className="logout-button" onClick={logout}>
          Logout
        </button>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <h1>Dashboard</h1>
            <p>Monitor your orders and payment settlements</p>
          </div>

          <button onClick={loadDashboard} disabled={loading}>
            Refresh Data
          </button>
        </header>

        {error && <div className="alert error">{error}</div>}
        {message && <div className="alert success">{message}</div>}
        {loading && <p className="loading">Loading data...</p>}

        {/* DASHBOARD CARDS */}

        <section id="dashboard" className="stats-grid">
          <div className="stat-card">
            <p>Total Orders</p>
            <h2>{orders.length}</h2>
          </div>

          <div className="stat-card">
            <p>Total Settlements</p>
            <h2>{settlements.length}</h2>
          </div>

          <div className="stat-card">
            <p>Matched Orders</p>
            <h2>{summary?.matchedCount ?? 0}</h2>
          </div>

          <div className="stat-card">
            <p>Mismatches</p>
            <h2>{summary?.mismatchCount ?? 0}</h2>
          </div>

          <div className="stat-card">
            <p>Pending Orders</p>
            <h2>{summary?.pendingCount ?? 0}</h2>
          </div>

          <div className="stat-card risk-card">
            <p>Money at Risk</p>
            <h2>{money(summary?.moneyAtRisk)}</h2>
          </div>
        </section>

        {/* DASHBOARD ANALYTICS */}

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '18px',
            marginBottom: '24px'
          }}
        >
          <div className="panel" style={{ marginBottom: 0 }}>
            <h2>Reconciliation Status</h2>
            <p className="summary-note">
              Breakdown of orders from the latest reconciliation run.
            </p>

            {[
              { label: 'Matched', count: matchedOrders, color: '#16a34a' },
              { label: 'Mismatched', count: mismatchedOrders, color: '#dc2626' },
              { label: 'Pending', count: pendingOrders, color: '#d97706' }
            ].map(item => {
              const total = matchedOrders + mismatchedOrders + pendingOrders;
              const percentage = total ? (item.count / total) * 100 : 0;

              return (
                <div key={item.label} style={{ marginTop: '18px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '7px',
                      fontSize: '14px'
                    }}
                  >
                    <strong>{item.label}</strong>
                    <span>{item.count} ({percentage.toFixed(1)}%)</span>
                  </div>

                  <div
                    style={{
                      height: '12px',
                      background: '#e5e7eb',
                      borderRadius: '10px',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        width: `${percentage}%`,
                        height: '100%',
                        background: item.color,
                        borderRadius: '10px',
                        transition: 'width 0.3s ease'
                      }}
                    />
                  </div>
                </div>
              );
            })}

            {results.length === 0 && (
              <p className="summary-note" style={{ marginTop: '18px' }}>
                Run reconciliation to view status analytics.
              </p>
            )}
          </div>

          <div className="panel" style={{ marginBottom: 0 }}>
            <h2>Financial Overview</h2>
            <p className="summary-note">
              Total expected settlement compared with payments received.
            </p>

            {[
              {
                label: 'Expected Settlement',
                amount: expectedTotal,
                color: '#4057c5'
              },
              {
                label: 'Received Settlement',
                amount: receivedTotal,
                color: '#16a34a'
              }
            ].map(item => (
              <div key={item.label} style={{ marginTop: '22px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '10px',
                    marginBottom: '8px',
                    fontSize: '14px'
                  }}
                >
                  <strong>{item.label}</strong>
                  <strong>{money(item.amount)}</strong>
                </div>

                <div
                  style={{
                    height: '16px',
                    background: '#e5e7eb',
                    borderRadius: '10px',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      width: `${(item.amount / financialMax) * 100}%`,
                      height: '100%',
                      background: item.color,
                      borderRadius: '10px',
                      transition: 'width 0.3s ease'
                    }}
                  />
                </div>
              </div>
            ))}

            <p className="summary-note" style={{ marginTop: '20px' }}>
              Difference: {money(expectedTotal - receivedTotal)}
            </p>
          </div>
        </section>

        {/* RECONCILIATION */}

        <section className="panel">

          {/* TALLY EXPORT SETTINGS */}

          <div
            id="tally-settings"
            className="panel"
            style={{
              background: '#f8faff',
              marginBottom: '22px'
            }}
          >
            <h2>Tally Export Settings</h2>

            <p className="summary-note">
              Configure your accounting ledger names, voucher type and
              export filter. Your ledger settings are saved automatically.
            </p>

            <div className="form-grid">
              <div>
                <label>Bank Ledger Name</label>
                <input
                  type="text"
                  value={bankLedger}
                  onChange={e => setBankLedger(e.target.value)}
                  placeholder="Bank Account"
                />
              </div>

              <div>
                <label>Marketplace Receivable Ledger</label>
                <input
                  type="text"
                  value={marketplaceLedger}
                  onChange={e => setMarketplaceLedger(e.target.value)}
                  placeholder="Marketplace Receivable"
                />
              </div>

              <div>
                <label>Voucher Type</label>
                <select
                  value={voucherType}
                  onChange={e => setVoucherType(e.target.value)}
                >
                  <option value="Receipt">Receipt</option>
                  <option value="Journal">Journal</option>
                </select>
              </div>

              <div>
                <label>Tally Export Filter</label>
                <select
                  value={exportFilter}
                  onChange={e => setExportFilter(e.target.value)}
                >
                  <option value="all">All Settlements</option>
                  <option value="matched">Matched Orders Only</option>
                  <option value="excludeUnknown">
                    Exclude Unknown Orders
                  </option>
                </select>
              </div>
            </div>

            <p className="summary-note" style={{ marginTop: '12px' }}>
              {exportFilter === 'all' &&
                'Exports all settlements, including unknown orders and mismatches.'}

              {exportFilter === 'matched' &&
                'Exports settlements belonging only to orders whose total received amount matches the expected settlement.'}

              {exportFilter === 'excludeUnknown' &&
                'Exports settlements linked to existing orders, including matched and mismatched orders.'}
            </p>

            {/* TALLY EXPORT SUMMARY */}

            <div
              style={{
                marginTop: '20px',
                padding: '18px',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '10px'
              }}
            >
              <h3>Export Summary</h3>

              <p className="summary-note">
                Selected filter: {
                  exportFilter === 'all'
                    ? 'All Settlements'
                    : exportFilter === 'matched'
                      ? 'Matched Orders Only'
                      : 'Exclude Unknown Orders'
                }
              </p>

              <div className="stats-grid">
                <div className="stat-card">
                  <p>Vouchers to Export</p>
                  <h2>{filteredSettlements.length}</h2>
                </div>

                <div className="stat-card">
                  <p>Total Export Amount</p>
                  <h2>{money(exportTotal)}</h2>
                </div>

                <div className="stat-card">
                  <p>Matched Orders</p>
                  <h2>{exportMatchedCount}</h2>
                </div>

                <div className="stat-card">
                  <p>Mismatched Orders</p>
                  <h2>{exportMismatchCount}</h2>
                </div>

                <div className="stat-card">
                  <p>Unknown Orders</p>
                  <h2>{exportUnknownCount}</h2>
                </div>
              </div>

              <p className="summary-note">
                This is a preview. The actual XML is generated by the backend
                using the selected export filter.
              </p>
            </div>
          </div>

          <div className="panel-heading">
            <div>
              <h2>Reconciliation</h2>
              <p>Compare orders against settlement payments</p>
            </div>

            <div style={{
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap'
            }}>
              <button
                onClick={runReconciliation}
                disabled={loading}
              >
                {loading ? 'Processing...' : 'Run Reconciliation'}
              </button>

              <button
                onClick={exportTallyCsv}
                disabled={results.length === 0}
              >
                Export for Tally (CSV)
              </button>

              <button
                onClick={exportTallyXml}
                disabled={settlements.length === 0}
              >
                Export Tally XML
              </button>

              <button
                onClick={exportExcelReport}
                disabled={
                  orders.length === 0 &&
                  settlements.length === 0 &&
                  results.length === 0 &&
                  claims.length === 0
                }
              >
                Download Excel Report
              </button>

              <button
                onClick={exportPDFReport}
                disabled={results.length === 0}
              >
                Download PDF Report
              </button>
            </div>
          </div>

          {summary && (
            <p className="summary-note">
              Last run: {summary.totalOrders} orders checked.
              Unknown order IDs: {summary.unknownOrderCount}.
            </p>
          )}

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Expected</th>
                  <th>Received</th>
                  <th>Difference</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {results.length === 0 ? (
                  <tr>
                    <td colSpan="6">
                      Run reconciliation to view results.
                    </td>
                  </tr>
                ) : (
                  results.map((item, index) => (
                    <tr
                      key={`${item.orderId || item.externalOrderId || 'row'}-${index}`}
                    >
                      <td>
                        {item.orderId || item.externalOrderId || '—'}
                      </td>

                      <td>{money(item.expectedSettlement)}</td>

                      <td>
                        {item.receivedSettlement == null
                          ? '—'
                          : money(item.receivedSettlement)}
                      </td>

                      <td>
                        {item.difference == null
                          ? '—'
                          : money(item.difference)}
                      </td>

                      <td>
                        <span
                          className={`status ${(item.status || '').toLowerCase()}`}
                        >
                          {item.status}
                        </span>
                      </td>

                      <td>
                        {(() => {
                          const matchingOrder = orders.find(
                            order =>
                              order.id === item.orderId ||
                              order.externalOrderId === item.orderId ||
                              order.externalOrderId === item.externalOrderId
                          );

                          const externalOrderId =
                            item.externalOrderId ||
                            matchingOrder?.externalOrderId ||
                            item.orderId;

                          const alreadyHasClaim = claims.some(
                            claim =>
                              claim.order?.externalOrderId === externalOrderId
                          );

                          const canGenerateClaim =
                            Number(item.difference) > 0 &&
                            ['MISMATCH', 'MISMATCHED'].includes(
                              String(item.status || '').toUpperCase()
                            );

                          if (!canGenerateClaim) return '—';

                          if (alreadyHasClaim) return 'Claim exists';

                          return (
                            <button
                              onClick={() => generateClaim(externalOrderId)}
                              disabled={
                                loading || claimGenerating === externalOrderId
                              }
                            >
                              {claimGenerating === externalOrderId
                                ? 'Generating...'
                                : 'Generate Claim'}
                            </button>
                          );
                        })()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* CSV IMPORTS AND AI MAPPING */}

        <section id="uploads" className="panel">
          <h2>CSV Imports</h2>

          <p className="summary-note">
            Upload order and settlement CSV files.
            Review the preview before importing.
          </p>

          <div className="form-grid">
            <div>
              <label>Order CSV</label>
              <input
                type="file"
                accept=".csv"
                onChange={e => readCsv(e.target.files[0], 'orders')}
              />

              {orderFileName && <p>{orderFileName}</p>}
            </div>

            <div>
              <label>Settlement CSV</label>
              <input
                type="file"
                accept=".csv"
                onChange={e => readCsv(e.target.files[0], 'settlements')}
              />

              {settlementFileName && <p>{settlementFileName}</p>}
            </div>
          </div>

          {/* AI MAPPING PANEL */}

          {rawCsv && (
            <div
              className="panel"
              style={{ background: '#f8faff', marginTop: '20px' }}
            >
              <h2>AI Column Mapping</h2>

              <p className="summary-note">
                Selected file: {rawCsv.fileName}
                <br />
                CSV type: {rawCsv.type}
                <br />
                Rows available: {rawCsv.rows.length}
              </p>

              <button
                onClick={suggestAiMapping}
                disabled={aiLoading || loading}
              >
                {aiLoading
                  ? 'Analyzing CSV...'
                  : 'Suggest AI Column Mapping'}
              </button>

              {aiMapping && (
                <div style={{ marginTop: '20px' }}>
                  <h3>
                    AI Confidence: {aiMapping.confidence ?? 'N/A'}
                    {aiMapping.confidence != null ? '%' : ''}
                  </h3>

                  <p>
                    {aiMapping.explanation ||
                      'AI mapping suggestions generated.'}
                  </p>

                  <h3>Suggested Column Mapping</h3>

                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>Application Field</th>
                          <th>Suggested CSV Column</th>
                        </tr>
                      </thead>

                      <tbody>
                        {Object.entries(aiMapping.mapping).map(
                          ([key, value]) => (
                            <tr key={key}>
                              <td>{key}</td>
                              <td>
                                {typeof value === 'object'
                                  ? value?.column ||
                                    value?.sourceColumn ||
                                    value?.header ||
                                    value?.field ||
                                    '—'
                                  : String(value)}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>

                  <button
                    onClick={applyAiMapping}
                    style={{ marginTop: '12px' }}
                  >
                    Apply AI Mapping
                  </button>
                </div>
              )}
            </div>
          )}

          {/* CSV VALIDATION ERRORS */}

          {csvErrors.length > 0 && (
            <div
              className="panel"
              style={{ background: '#fff7ed', marginTop: '20px' }}
            >
              <h3>CSV Validation Errors ({csvErrors.length})</h3>

              <p className="summary-note">
                These rows will not be imported. Only valid rows are included
                in the preview.
              </p>

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>CSV Row</th>
                      <th>Reason</th>
                    </tr>
                  </thead>

                  <tbody>
                    {csvErrors.map((item, index) => (
                      <tr key={`${item.row}-${index}`}>
                        <td>{item.row}</td>
                        <td>{item.reasons.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ORDER PREVIEW */}

          {orderPreview.length > 0 && (
            <>
              <h3>Valid Order Preview (first 20 rows)</h3>

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Order ID</th>
                      <th>Channel</th>
                      <th>Order Amount</th>
                      <th>Expected Settlement</th>
                    </tr>
                  </thead>

                  <tbody>
                    {orderPreview.slice(0, 20).map((row, i) => (
                      <tr key={i}>
                        <td>{row.externalOrderId}</td>
                        <td>{row.channel}</td>
                        <td>{row.orderAmount}</td>
                        <td>{row.expectedSettlement}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={() => importCsv('orders')}
                disabled={loading}
              >
                Approve and Import {orderPreview.length} Orders
              </button>

              <button
                className="logout-button"
                onClick={() => {
                  setOrderPreview([]);
                  setOrderFileName('');
                  setRawCsv(null);
                  setAiMapping(null);
                  setCsvErrors([]);
                }}
              >
                Cancel Preview
              </button>
            </>
          )}

          {/* SETTLEMENT PREVIEW */}

          {settlementPreview.length > 0 && (
            <>
              <h3>Valid Settlement Preview (first 20 rows)</h3>

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Order ID</th>
                      <th>Amount</th>
                      <th>Date</th>
                    </tr>
                  </thead>

                  <tbody>
                    {settlementPreview.slice(0, 20).map((row, i) => (
                      <tr key={i}>
                        <td>{row.externalOrderId}</td>
                        <td>{row.amount}</td>
                        <td>{row.settlementDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={() => importCsv('settlements')}
                disabled={loading}
              >
                Approve and Import {settlementPreview.length} Settlements
              </button>

              <button
                className="logout-button"
                onClick={() => {
                  setSettlementPreview([]);
                  setSettlementFileName('');
                  setRawCsv(null);
                  setAiMapping(null);
                  setCsvErrors([]);
                }}
              >
                Cancel Preview
              </button>
            </>
          )}
        </section>

        {/* ORDERS */}

        <section id="orders" className="panel">
          <h2>Create Order</h2>

          <form className="form-grid" onSubmit={createOrder}>
            <input
              placeholder="External Order ID"
              value={orderForm.externalOrderId}
              onChange={e =>
                setOrderForm({
                  ...orderForm,
                  externalOrderId: e.target.value
                })
              }
              required
            />

            <select
              value={orderForm.channel}
              onChange={e =>
                setOrderForm({
                  ...orderForm,
                  channel: e.target.value
                })
              }
            >
              <option>Amazon</option>
              <option>Flipkart</option>
              <option>Shopify</option>
              <option>Other</option>
            </select>

            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Order Amount"
              value={orderForm.orderAmount}
              onChange={e =>
                setOrderForm({
                  ...orderForm,
                  orderAmount: e.target.value
                })
              }
              required
            />

            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Expected Settlement"
              value={orderForm.expectedSettlement}
              onChange={e =>
                setOrderForm({
                  ...orderForm,
                  expectedSettlement: e.target.value
                })
              }
              required
            />

            <button type="submit">Add Order</button>
          </form>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Channel</th>
                  <th>Order Amount</th>
                  <th>Expected Settlement</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan="5">No orders found.</td>
                  </tr>
                ) : (
                  orders.map(order => (
                    <tr key={order.id}>
                      <td>{order.externalOrderId}</td>
                      <td>{order.channel}</td>
                      <td>{money(order.orderAmount)}</td>
                      <td>{money(order.expectedSettlement)}</td>
                      <td>{order.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* SETTLEMENTS */}

        <section id="settlements" className="panel">
          <h2>Add Settlement</h2>

          <form className="form-grid" onSubmit={createSettlement}>
            <input
              placeholder="External Order ID"
              value={settlementForm.externalOrderId}
              onChange={e =>
                setSettlementForm({
                  ...settlementForm,
                  externalOrderId: e.target.value
                })
              }
              required
            />

            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Received Amount"
              value={settlementForm.amount}
              onChange={e =>
                setSettlementForm({
                  ...settlementForm,
                  amount: e.target.value
                })
              }
              required
            />

            <input
              type="date"
              value={settlementForm.settlementDate}
              onChange={e =>
                setSettlementForm({
                  ...settlementForm,
                  settlementDate: e.target.value
                })
              }
              required
            />

            <button type="submit">Add Settlement</button>
          </form>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Received Amount</th>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {settlements.length === 0 ? (
                  <tr>
                    <td colSpan="5">No settlements found.</td>
                  </tr>
                ) : (
                  settlements.map(item => (
                    <tr key={item.id}>
                      <td>{item.externalOrderId}</td>
                      <td>{money(item.amount)}</td>
                      <td>
                        {new Date(item.settlementDate).toLocaleDateString()}
                      </td>
                      <td>{item.sourceFile || 'Manual'}</td>
                      <td>
                        <button
                          className="logout-button"
                          onClick={() => deleteSettlement(item.id)}
                          disabled={loading}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* CLAIMS */}

        <section id="claims" className="panel">
          <h2>Submit a Claim</h2>

          <form className="form-grid" onSubmit={createClaim}>
            <input
              placeholder="External Order ID"
              value={claimForm.externalOrderId}
              onChange={e =>
                setClaimForm({
                  ...claimForm,
                  externalOrderId: e.target.value
                })
              }
              required
            />

            <input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Claim Amount"
              value={claimForm.amount}
              onChange={e =>
                setClaimForm({
                  ...claimForm,
                  amount: e.target.value
                })
              }
              required
            />

            <input
              placeholder="Reason for claim"
              value={claimForm.reason}
              onChange={e =>
                setClaimForm({
                  ...claimForm,
                  reason: e.target.value
                })
              }
              required
            />

            <button type="submit">Submit Claim</button>
          </form>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Amount</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Update Status</th>
                </tr>
              </thead>

              <tbody>
                {claims.length === 0 ? (
                  <tr>
                    <td colSpan="5">No claims found.</td>
                  </tr>
                ) : (
                  claims.map(claim => (
                    <tr key={claim.id}>
                      <td>
                        {claim.order?.externalOrderId || '—'}
                      </td>

                      <td>{money(claim.amount)}</td>
                      <td>{claim.reason}</td>
                      <td>{claim.status}</td>

                      <td>
                        <select
                          value={claim.status}
                          onChange={e =>
                            updateClaimStatus(claim.id, e.target.value)
                          }
                        >
                          <option value="SUBMITTED">SUBMITTED</option>
                          <option value="APPROVED">APPROVED</option>
                          <option value="REJECTED">REJECTED</option>
                          <option value="PAID">PAID</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;