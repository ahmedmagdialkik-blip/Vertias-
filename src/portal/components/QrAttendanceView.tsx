import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import jsQR from 'jsqr';
import {
  Camera,
  CameraOff,
  CheckCircle2,
  QrCode,
  RefreshCw,
  RotateCcw,
  ScanLine,
  ShieldAlert,
  Users,
  XCircle
} from 'lucide-react';
import {
  filterQrPasses,
  isQrScannerAuthorizedProfile,
  normalizeQrTokenInput,
  summarizeQrAttendance,
  type QrPassLike
} from '../../utils/managementLogic';
import { invokeEdgeFunction } from './invokeEdgeFunction';

interface QrAttendanceViewProps {
  sb: any;
  me: any;
  initialMode?: 'pass' | 'scanner' | 'registry';
}

const GATES = ['Main Gate', 'Registration Desk', 'VIP Gate', 'Hall A', 'Security Post'] as const;

export const QrAttendanceView: React.FC<QrAttendanceViewProps> = ({
  sb,
  me,
  initialMode = 'registry'
}) => {
  const canScan = isQrScannerAuthorizedProfile(me);
  const canViewRegistry = me.role === 'admin' || me.role === 'head' || canScan;
  const isAdmin = me.role === 'admin';

  const resolvedDefaultMode =
    initialMode === 'scanner' && canScan
      ? 'scanner'
      : initialMode === 'registry' && canViewRegistry
        ? 'registry'
        : 'pass';

  const [mode, setMode] = useState<'pass' | 'scanner' | 'registry'>(resolvedDefaultMode);
  const [myPass, setMyPass] = useState<any | null>(null);
  const [passes, setPasses] = useState<any[]>([]);
  const [scans, setScans] = useState<any[]>([]);
  const [corrections, setCorrections] = useState<any[]>([]);
  const [resets, setResets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Scanner state
  const [scanType, setScanType] = useState<'check_in' | 'check_out'>('check_in');
  const [gateName, setGateName] = useState<string>('Main Gate');
  const [manualToken, setManualToken] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [scanResult, setScanResult] = useState<{
    ok: boolean;
    outcome: string;
    message: string;
    pass?: any;
    repeat_warning?: boolean;
  } | null>(null);

  // Live Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number>(0);
  const lastDecodedRef = useRef<{ token: string; ts: number }>({ token: '', ts: 0 });

  // Registry filters + admin corrections + reset modal
  const [query, setQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState<'all' | 'inside' | 'checked_out' | 'not_checked_in' | 'inactive'>('all');
  const [corrTarget, setCorrTarget] = useState<any | null>(null);
  const [corrAction, setCorrAction] = useState<'force_checkin' | 'force_checkout' | 'clear_attendance' | 'toggle_active'>('force_checkin');
  const [corrReason, setCorrReason] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [resetReason, setResetReason] = useState('Conference day reset');
  const [adminMsg, setAdminMsg] = useState('');
  const [adminErr, setAdminErr] = useState('');

  const broadcastSync = useCallback(() => {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const ch = new BroadcastChannel('veritas_qr_sync');
        ch.postMessage({ type: 'refresh', ts: Date.now() });
        ch.close();
      }
    } catch {
      // ignore
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    const reqs: Promise<any>[] = [
      sb.from('qr_passes').select('*').eq('user_id', me.id).maybeSingle()
    ];

    if (canViewRegistry) {
      reqs.push(sb.from('qr_passes').select('*').order('full_name', { ascending: true }));
    }
    if (canScan) {
      reqs.push(sb.from('qr_scans').select('*').order('created_at', { ascending: false }).limit(40));
    }
    if (isAdmin) {
      reqs.push(sb.from('qr_correction_logs').select('*').order('created_at', { ascending: false }).limit(30));
      reqs.push(sb.from('qr_attendance_resets').select('*').order('created_at', { ascending: false }).limit(15));
    }

    const [myRes, allRes, scansRes, corrRes, rstRes] = await Promise.all(reqs);
    if (!myRes.error) setMyPass(myRes.data || null);
    if (allRes && !allRes.error) setPasses(allRes.data || []);
    if (scansRes && !scansRes.error) setScans(scansRes.data || []);
    if (corrRes && !corrRes.error) setCorrections(corrRes.data || []);
    if (rstRes && !rstRes.error) setResets(rstRes.data || []);
    setLoading(false);
  }, [sb, me.id, canViewRegistry, canScan, isAdmin]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Real-time Postgres Changes + BroadcastChannel cross-tab sync
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('veritas_qr_sync');
      bc.onmessage = () => {
        void loadData();
      };
    }

    let channel: any = null;
    if (typeof sb.channel === 'function') {
      channel = sb
        .channel('veritas-qr-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'qr_passes' }, () => {
          void loadData();
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'qr_scans' }, () => {
          void loadData();
        })
        .subscribe();
    }

    return () => {
      if (bc) bc.close();
      if (channel && typeof sb.removeChannel === 'function') sb.removeChannel(channel);
    };
  }, [sb, loadData]);

  const stopCamera = useCallback(() => {
    if (scanLoopRef.current) {
      window.cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = 0;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const submitScan = useCallback(
    async (rawInput: string) => {
      const normalized = normalizeQrTokenInput(rawInput);
      if (!normalized || scanBusy) return;
      if (!canScan) {
        setScanResult({
          ok: false,
          outcome: 'forbidden',
          message: 'QR scanning is restricted to Administrators and Security team.'
        });
        return;
      }

      setScanBusy(true);
      try {
        const edgeAction = scanType === 'check_in' ? 'scan_check_in' : 'scan_check_out';
        const res = await invokeEdgeFunction<any>(sb, 'veritas-qr', {
          action: edgeAction,
          token: normalized,
          gate: gateName
        });

        let payload = res.data;
        if (res.isEdgeUnavailable) {
          const rpcName = scanType === 'check_in' ? 'atomic_qr_checkin' : 'atomic_qr_checkout';
          const { data: rpcData, error: rpcErr } = await sb.rpc(rpcName, {
            p_token: normalized,
            p_gate: gateName
          });
          if (rpcErr) {
            setScanResult({
              ok: false,
              outcome: 'error',
              message: rpcErr.message || 'Scan failed.'
            });
            return;
          }
          payload = rpcData;
        } else if (res.error) {
          setScanResult({
            ok: false,
            outcome: 'error',
            message: res.error
          });
          return;
        }

        if (payload) {
          setScanResult(payload);
          setManualToken('');
          broadcastSync();
          await loadData();
        }
      } finally {
        setScanBusy(false);
      }
    },
    [sb, canScan, scanBusy, scanType, gateName, broadcastSync, loadData]
  );

  const startCamera = async () => {
    setCameraError('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera API is unavailable in this browser. Use manual or USB scanner token entry below.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);

      const BarcodeDet = (window as any).BarcodeDetector;
      const detector = BarcodeDet ? new BarcodeDet({ formats: ['qr_code'] }) : null;

      const tick = async () => {
        const video = videoRef.current;
        if (!streamRef.current || !video) return;
        if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
          let detectedRaw = '';
          if (detector) {
            try {
              const codes = await detector.detect(video);
              if (codes?.[0]?.rawValue) detectedRaw = String(codes[0].rawValue);
            } catch {
              // fall through to jsQR
            }
          }
          if (!detectedRaw && canvasRef.current) {
            const cvs = canvasRef.current;
            cvs.width = video.videoWidth;
            cvs.height = video.videoHeight;
            const ctx = cvs.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, cvs.width, cvs.height);
              const imgData = ctx.getImageData(0, 0, cvs.width, cvs.height);
              const decoded = jsQR(imgData.data, imgData.width, imgData.height);
              if (decoded?.data) detectedRaw = decoded.data;
            }
          }

          if (detectedRaw) {
            const norm = normalizeQrTokenInput(detectedRaw);
            const now = Date.now();
            if (norm && (norm !== lastDecodedRef.current.token || now - lastDecodedRef.current.ts > 3500)) {
              lastDecodedRef.current = { token: norm, ts: now };
              void submitScan(norm);
            }
          }
        }
        if (streamRef.current) {
          scanLoopRef.current = window.requestAnimationFrame(() => void tick());
        }
      };

      scanLoopRef.current = window.requestAnimationFrame(() => void tick());
    } catch (err: any) {
      setCameraError(
        err?.message || 'Camera permission was denied or no camera was detected. Use manual token input below.'
      );
      stopCamera();
    }
  };

  const handleManualCorrect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!corrTarget) return;
    setAdminErr('');
    setAdminMsg('');
    if (corrReason.trim().length < 3) {
      setAdminErr('Enter a reason (at least 3 characters) for audit logging.');
      return;
    }
    const { error } = await sb.rpc('manual_correct_qr_pass', {
      p_pass_id: corrTarget.id,
      p_action: corrAction,
      p_reason: corrReason.trim()
    });
    if (error) {
      setAdminErr(error.message || 'Correction failed.');
      return;
    }
    setAdminMsg(`Recorded manual correction (${corrAction}) for ${corrTarget.full_name}.`);
    setCorrTarget(null);
    setCorrReason('');
    broadcastSync();
    await loadData();
  };

  const handleGlobalReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminErr('');
    setAdminMsg('');
    if (resetConfirmation !== 'RESET') {
      setAdminErr('Type RESET in all caps to confirm global conference attendance reset.');
      return;
    }
    const { data, error } = await sb.rpc('reset_all_qr_attendance', {
      p_confirmation: resetConfirmation,
      p_reason: resetReason.trim() || 'Conference day reset'
    });
    if (error) {
      setAdminErr(error.message || 'Global reset failed.');
      return;
    }
    setResetOpen(false);
    setResetConfirmation('');
    setAdminMsg(`Reset attendance across ${(data as any)?.affected_count ?? 0} pass(es).`);
    broadcastSync();
    await loadData();
  };

  const summary = useMemo(() => summarizeQrAttendance(passes as QrPassLike[]), [passes]);
  const departments = useMemo(() => {
    const s = new Set<string>();
    for (const p of passes) {
      if (p.department) s.add(p.department);
    }
    return Array.from(s).sort();
  }, [passes]);
  const filteredPasses = useMemo(
    () => filterQrPasses(passes, { query, department: deptFilter, state: stateFilter }),
    [passes, query, deptFilter, stateFilter]
  );

  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div>
          <p className="admin-kicker">QR &amp; FLOOR ATTENDANCE</p>
          <h1>
            {mode === 'pass'
              ? 'My Conference QR Pass'
              : mode === 'scanner'
                ? 'Live QR Gate Scanner'
                : 'QR Attendance Registry'}
          </h1>
          <p>
            Opaque single-token VMQR passes with atomic row-locked check-in and check-out enforcement, Realtime floor sync, and Executive Board audit controls.
          </p>
        </div>
        <button type="button" className="btn ghost" onClick={() => void loadData()}>
          <RefreshCw size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Refresh
        </button>
      </div>

      <div className="tabs" role="tablist">
        <button type="button" className={mode === 'pass' ? 'on' : ''} onClick={() => { stopCamera(); setMode('pass'); }}>
          My QR Pass
        </button>
        {canScan && (
          <button type="button" className={mode === 'scanner' ? 'on' : ''} onClick={() => setMode('scanner')}>
            Live QR Scanner
          </button>
        )}
        {canViewRegistry && (
          <button type="button" className={mode === 'registry' ? 'on' : ''} onClick={() => { stopCamera(); setMode('registry'); }}>
            Attendance Registry
          </button>
        )}
      </div>

      {adminMsg && <div className="msg" role="status" style={{ fontWeight: 600 }}>{adminMsg}</div>}
      {adminErr && <div className="err" role="alert">{adminErr}</div>}

      {mode === 'pass' && (
        <section className="admin-panel" aria-label="My digital QR pass" style={{ maxWidth: 520 }}>
          {loading ? (
            <p>Loading your conference pass...</p>
          ) : !myPass ? (
            <div className="admin-empty-state">
              <QrCode size={26} />
              <strong>No active QR pass provisioned yet</strong>
              <p>Active team members receive a digital QR pass automatically once their account is active.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14 }}>
              <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="admin-kicker" style={{ margin: '0 !important' }}>VERITAS MUN CREDENTIAL</span>
                <span className={myPass.active ? 'badge g' : 'badge r'} style={{ marginLeft: 0 }}>
                  {myPass.active ? 'ACTIVE PASS' : 'REVOKED'}
                </span>
              </div>

              <div
                style={{
                  padding: 18,
                  background: '#FFFFFF',
                  border: '2px solid #1A1217',
                  borderRadius: 10
                }}
              >
                <QRCodeSVG value={myPass.token_value} size={210} level="M" />
              </div>

              <div>
                <h2 style={{ margin: '0 0 4px' }}>{myPass.full_name}</h2>
                <div style={{ color: '#51464A', fontSize: 15 }}>
                  {myPass.role_label}{myPass.department ? ` · ${myPass.department}` : ''}
                </div>
                <div style={{ marginTop: 6 }}>
                  <code style={{ padding: '4px 10px', background: '#EDE6D6', border: '1px solid #BAB1A0', borderRadius: 4, fontWeight: 700 }}>
                    {myPass.pass_code}
                  </code>
                </div>
              </div>

              <div
                style={{
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                  paddingTop: 10,
                  borderTop: '1px solid #D2C9BB',
                  fontSize: 13
                }}
              >
                <div>
                  <span className="review-k">Check-In</span>
                  <strong>{myPass.checked_in_at ? `${new Date(myPass.checked_in_at).toLocaleTimeString()} (${myPass.checked_in_gate})` : 'Not checked in'}</strong>
                </div>
                <div>
                  <span className="review-k">Check-Out</span>
                  <strong>{myPass.checked_out_at ? `${new Date(myPass.checked_out_at).toLocaleTimeString()} (${myPass.checked_out_gate})` : 'Not checked out'}</strong>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {mode === 'scanner' && canScan && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
          <section className="admin-panel" aria-label="Scanner controls">
            <p className="admin-kicker">GATE CONFIGURATION &amp; CAMERA</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="scan-mode-sel">Scan Action</label>
                <select
                  id="scan-mode-sel"
                  value={scanType}
                  onChange={e => setScanType(e.target.value as 'check_in' | 'check_out')}
                >
                  <option value="check_in">Check In (Arrival)</option>
                  <option value="check_out">Check Out (Departure)</option>
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="scan-gate-sel">Gate / Station</label>
                <select
                  id="scan-gate-sel"
                  value={gateName}
                  onChange={e => setGateName(e.target.value)}
                >
                  {GATES.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="toolbar" style={{ marginTop: 0 }}>
              {!cameraActive ? (
                <button type="button" className="btn" onClick={() => void startCamera()}>
                  <Camera size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                  Start Camera Scanner
                </button>
              ) : (
                <button type="button" className="btn red" onClick={stopCamera}>
                  <CameraOff size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                  Stop Camera
                </button>
              )}
            </div>

            {cameraError && <div className="err" role="alert" style={{ marginBottom: 10 }}>{cameraError}</div>}

            <div
              style={{
                background: '#1A1217',
                borderRadius: 8,
                overflow: 'hidden',
                marginBottom: 14,
                minHeight: cameraActive ? 220 : 0,
                display: cameraActive ? 'block' : 'none'
              }}
            >
              <video ref={videoRef} playsInline muted style={{ width: '100%', display: 'block', maxHeight: 300, objectFit: 'cover' }} />
              <canvas ref={canvasRef} hidden />
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                void submitScan(manualToken);
              }}
            >
              <label htmlFor="manual-qr-input" style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>
                Manual or USB Barcode Scanner Input (VMQR-* or VM-*)
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="manual-qr-input"
                  value={manualToken}
                  onChange={e => setManualToken(e.target.value)}
                  placeholder="VMQR-... or VM-A1B2C3D4"
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn" disabled={scanBusy || !manualToken.trim()}>
                  <ScanLine size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                  {scanBusy ? 'Verifying...' : scanType === 'check_in' ? 'Check In' : 'Check Out'}
                </button>
              </div>
            </form>

            {scanResult && (
              <div
                role="status"
                style={{
                  marginTop: 14,
                  padding: 14,
                  borderRadius: 8,
                  border: `1px solid ${scanResult.ok ? '#2F6B34' : '#8A2B2B'}`,
                  background: scanResult.ok ? '#E6EDE2' : '#F1DFDC'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                  {scanResult.ok ? <CheckCircle2 size={18} color="#2F6B34" /> : <XCircle size={18} color="#8A2B2B" />}
                  <span style={{ textTransform: 'uppercase', fontSize: 12 }}>{scanResult.outcome}</span>
                </div>
                <p style={{ margin: '6px 0 0', fontWeight: 600, color: '#1A1217' }}>{scanResult.message}</p>
                {scanResult.pass && (
                  <div style={{ fontSize: 13, marginTop: 4, color: '#51464A' }}>
                    Pass: <code>{scanResult.pass.pass_code}</code> · {scanResult.pass.department} · {scanResult.pass.role_label}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="admin-panel" aria-label="Recent gate scans">
            <p className="admin-kicker">LIVE SCAN FEED ({scans.length})</p>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Type</th>
                    <th>Gate</th>
                    <th>Outcome</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.slice(0, 18).map(sc => (
                    <tr key={sc.id}>
                      <td>{new Date(sc.created_at).toLocaleTimeString()}</td>
                      <td>{sc.scan_type}</td>
                      <td>{sc.gate_name}</td>
                      <td>
                        <span className={sc.outcome === 'success' ? 'badge g' : 'badge r'} style={{ marginLeft: 0 }}>
                          {sc.outcome}
                        </span>
                      </td>
                      <td>{sc.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {mode === 'registry' && canViewRegistry && (
        <>
          <div className="admin-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <div className="admin-stat-card">
              <div className="admin-stat-top">
                <span className="admin-stat-label">Active Passes</span>
                <QrCode className="admin-stat-icon" size={17} />
              </div>
              <strong className="admin-stat-value">{summary.activePasses}</strong>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-top">
                <span className="admin-stat-label">Checked In Total</span>
                <CheckCircle2 className="admin-stat-icon" size={17} />
              </div>
              <strong className="admin-stat-value">{summary.checkedIn}</strong>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-top">
                <span className="admin-stat-label">Currently Inside</span>
                <Users className="admin-stat-icon" size={17} />
              </div>
              <strong className="admin-stat-value">{summary.currentlyInside}</strong>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-top">
                <span className="admin-stat-label">Checked Out</span>
                <XCircle className="admin-stat-icon" size={17} />
              </div>
              <strong className="admin-stat-value">{summary.checkedOut}</strong>
            </div>
          </div>

          <div className="admin-filter-panel">
            <div className="admin-filter-heading">
              <span className="admin-kicker">ATTENDANCE REGISTRY ({filteredPasses.length})</span>
              {isAdmin && (
                <button type="button" className="btn red" onClick={() => setResetOpen(true)}>
                  <RotateCcw size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                  Global Attendance Reset
                </button>
              )}
            </div>
            <div className="admin-filter-grid">
              <input
                placeholder="Search name, email, pass code..."
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
                <option value="all">All departments</option>
                {departments.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <select value={stateFilter} onChange={e => setStateFilter(e.target.value as any)}>
                <option value="all">All states</option>
                <option value="inside">Currently inside</option>
                <option value="checked_out">Checked out</option>
                <option value="not_checked_in">Not checked in yet</option>
                <option value="inactive">Revoked / Inactive</option>
              </select>
            </div>
          </div>

          {resetOpen && isAdmin && (
            <form
              className="admin-panel"
              onSubmit={handleGlobalReset}
              role="dialog"
              aria-label="Confirm global attendance reset"
              style={{ borderColor: '#8A2B2B', background: '#FBF3F1' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6B1F1F', marginBottom: 6 }}>
                <ShieldAlert size={18} />
                <strong style={{ fontFamily: 'Cinzel, serif' }}>CONFIRM GLOBAL ATTENDANCE RESET</strong>
              </div>
              <p style={{ marginTop: 0 }}>
                Clears all check-in and check-out timestamps across all passes (preserving pass codes and history in audit logs). Type <strong>RESET</strong> to confirm.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div className="field">
                  <label htmlFor="qr-reset-confirm">Type RESET<span className="req">*</span></label>
                  <input
                    id="qr-reset-confirm"
                    required
                    value={resetConfirmation}
                    onChange={e => setResetConfirmation(e.target.value)}
                    placeholder="RESET"
                  />
                </div>
                <div className="field">
                  <label htmlFor="qr-reset-reason">Reason</label>
                  <input
                    id="qr-reset-reason"
                    value={resetReason}
                    onChange={e => setResetReason(e.target.value)}
                    placeholder="Conference Day 2 reset"
                  />
                </div>
              </div>
              <div className="toolbar" style={{ margin: 0 }}>
                <button type="submit" className="btn red">Execute Global Reset</button>
                <button type="button" className="btn ghost" onClick={() => setResetOpen(false)}>Cancel</button>
              </div>
            </form>
          )}

          {corrTarget && isAdmin && (
            <form
              className="admin-panel"
              onSubmit={handleManualCorrect}
              style={{ borderColor: '#2F6B34' }}
            >
              <p className="admin-kicker">MANUAL ATTENDANCE CORRECTION — {corrTarget.full_name}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div className="field">
                  <label htmlFor="corr-action">Action</label>
                  <select id="corr-action" value={corrAction} onChange={e => setCorrAction(e.target.value as any)}>
                    <option value="force_checkin">Force Check-In</option>
                    <option value="force_checkout">Force Check-Out</option>
                    <option value="clear_attendance">Clear Check-In/Out Times</option>
                    <option value="toggle_active">{corrTarget.active ? 'Deactivate Pass' : 'Reactivate Pass'}</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="corr-reason">Audit Justification (min 3 chars)<span className="req">*</span></label>
                  <input
                    id="corr-reason"
                    required
                    minLength={3}
                    value={corrReason}
                    onChange={e => setCorrReason(e.target.value)}
                    placeholder="Why is this attendance record being adjusted?"
                  />
                </div>
              </div>
              <div className="toolbar" style={{ margin: 0 }}>
                <button type="submit" className="btn">Save Correction</button>
                <button type="button" className="btn ghost" onClick={() => setCorrTarget(null)}>Cancel</button>
              </div>
            </form>
          )}

          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Pass Code</th>
                  <th>Holder</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Check-In</th>
                  <th>Check-Out</th>
                  {isAdmin && <th>Correction</th>}
                </tr>
              </thead>
              <tbody>
                {filteredPasses.map(p => (
                  <tr key={p.id}>
                    <td><code>{p.pass_code}</code></td>
                    <td>
                      <strong>{p.full_name}</strong>
                      <div style={{ fontSize: 12, opacity: 0.78 }}>{p.role_label}{p.email ? ` · ${p.email}` : ''}</div>
                    </td>
                    <td>{p.department || '-'}</td>
                    <td>
                      {!p.active ? (
                        <span className="badge r" style={{ marginLeft: 0 }}>Revoked</span>
                      ) : p.checked_out_at ? (
                        <span className="badge" style={{ marginLeft: 0 }}>Checked out ({p.checkout_count})</span>
                      ) : p.checked_in_at ? (
                        <span className="badge g" style={{ marginLeft: 0 }}>Inside</span>
                      ) : (
                        <span className="badge" style={{ marginLeft: 0 }}>Pending arrival</span>
                      )}
                    </td>
                    <td>{p.checked_in_at ? `${new Date(p.checked_in_at).toLocaleTimeString()}${p.checked_in_gate ? ` · ${p.checked_in_gate}` : ''}` : '-'}</td>
                    <td>{p.checked_out_at ? `${new Date(p.checked_out_at).toLocaleTimeString()}${p.checked_out_gate ? ` · ${p.checked_out_gate}` : ''}` : '-'}</td>
                    {isAdmin && (
                      <td>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => {
                            setCorrTarget(p);
                            setCorrAction(p.checked_in_at && !p.checked_out_at ? 'force_checkout' : 'force_checkin');
                            setCorrReason('');
                          }}
                        >
                          Correct
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isAdmin && (corrections.length > 0 || resets.length > 0) && (
            <section className="admin-panel" aria-label="Correction and reset audit logs">
              <p className="admin-kicker">ATTENDANCE CORRECTION &amp; RESET AUDIT TRAIL</p>
              {corrections.map(c => (
                <div key={c.id} className="admin-activity-row">
                  <span><strong>{c.action}</strong> — {c.reason} ({c.actor_email})</span>
                  <time>{new Date(c.created_at).toLocaleString()}</time>
                </div>
              ))}
              {resets.map(r => (
                <div key={r.id} className="admin-activity-row">
                  <span><strong>GLOBAL RESET</strong> — {r.affected_count} passes cleared ({r.reason}) by {r.reset_by_email}</span>
                  <time>{new Date(r.created_at).toLocaleString()}</time>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
};
