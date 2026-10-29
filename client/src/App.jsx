import { useState, useEffect } from 'react';
import './App.css';

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
).replace(/\/$/, '');


function App() {
  const [backendStatus, setBackendStatus] = useState('Checking...');
  const [backendConnected, setBackendConnected] = useState(false);
  const [databaseStatus, setDatabaseStatus] = useState('Checking...');
  const [dqnStatus, setDqnStatus] = useState('Checking...');
  const [activePage, setActivePage] = useState('Dashboard');
  const [patients, setPatients] = useState([]);
const [patientError, setPatientError] = useState('');
  const [metrics, setMetrics] = useState(null);
  const [metricsError, setMetricsError] = useState('');
  const [dqnResult, setDqnResult] = useState(null);
  const [dqnLoading, setDqnLoading] = useState(false);
  const [dqnError, setDqnError] = useState('');
  const [scheduleMessage, setScheduleMessage] = useState('');
const [scheduleLoading, setScheduleLoading] = useState(false);
  const [newPatient, setNewPatient] = useState({
  patientId: '',
  name: '',
  priority: 'Normal',
  scanType: 'MRI',
});


  const handleAddPatient = async (event) => {
    event.preventDefault();
    setPatientError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/patients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newPatient),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Could not add patient');
      }

      setPatients((previousPatients) => [...previousPatients, data]);

      setNewPatient({
        patientId: '',
        name: '',
        priority: 'Normal',
        scanType: 'MRI',
      });
    } catch (error) {
      setPatientError(error.message);
    }
  };
const handleRunDqn = async () => {
  setDqnLoading(true);
  setDqnError('');
  setDqnResult(null);

  try {
    // Find patients who are waiting for an MRI scan
    const waitingPatients = patients.filter(
      (patient) =>
        String(patient.status || '').trim().toLowerCase() === 'waiting'
    );

    if (waitingPatients.length === 0) {
      throw new Error(
        'No waiting patients found. Please check the Patient Queue.'
      );
    }

    // Convert database patient details into the format expected by DQN
    const dqnPatients = waitingPatients.map((patient) => ({
      patient_id: patient.patientId,
      priority: patient.priority,
      arrival_time: Number(patient.arrivalTime ?? 0),
      waiting_time: Number(patient.waitingTime ?? 0),
      scan_duration: Number(patient.scanDuration ?? 20),
    }));

    const response = await fetch(
      `${API_BASE_URL}/api/dqn/schedule`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          current_time: 60,
          patients: dqnPatients,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || data.error || 'The DQN scheduling request failed.'
      );
    }

    setDqnResult(data);
  } catch (error) {
    setDqnError(error.message);
  } finally {
    setDqnLoading(false);
  }
};

const handleRunDqnTest = async () => {
  setDqnLoading(true);
  setDqnError('');
  setDqnResult(null);

  const testPatients = [
    {
      patient_id: 'TEST_P001',
      arrival_time: 10,
      priority: 'Emergency',
      waiting_time: 90,
      scan_duration: 20,
    },
    {
      patient_id: 'TEST_P002',
      arrival_time: 30,
      priority: 'Normal',
      waiting_time: 70,
      scan_duration: 15,
    },
    {
      patient_id: 'TEST_P003',
      arrival_time: 50,
      priority: 'Emergency',
      waiting_time: 50,
      scan_duration: 25,
    },
  ];

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/dqn/schedule`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          current_time: 100,
          patients: testPatients,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
          data.message ||
          'The DQN test request failed.'
      );
    }

    setDqnResult(data);
  } catch (error) {
    setDqnError(error.message);
  } finally {
    setDqnLoading(false);
  }
};

 const handleScheduleRecommendedPatient = async () => {
  const selectedPatientId = dqnResult?.selected?.patient_id;

  if (!selectedPatientId) {
    setScheduleMessage('No recommended patient is available.');
    return;
  }

  const patient = patients.find(
    (item) => item.patientId === selectedPatientId
  );

  if (!patient) {
    setScheduleMessage(
      'The recommended patient was not found in the database.'
    );
    return;
  }

  if (patient.status !== 'Waiting') {
    setScheduleMessage(
      `This patient is currently ${patient.status}. Only waiting patients can be scheduled.`
    );
    return;
  }

  setScheduleLoading(true);
  setScheduleMessage('');

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/patients/${patient._id}/schedule`,
      { method: 'PATCH' }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || 'Could not schedule the selected patient.'
      );
    }

    setPatients((previousPatients) =>
      previousPatients.map((item) =>
        item._id === patient._id ? data : item
      )
    );

    setScheduleMessage('Patient scheduled successfully.');
  } catch (error) {
    setScheduleMessage(error.message);
  } finally {
    setScheduleLoading(false);
  }
};


useEffect(() => {
  const checkHealth = () => {
    fetch(`${API_BASE_URL}/api/health`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Backend request failed');
        }
        return response.json();
      })
      .then((data) => {
        setBackendStatus(data.status);
        setBackendConnected(data.status === 'healthy');
        setDatabaseStatus(data.database);
        setDqnStatus(data.dqnIntegration);
      })
      .catch(() => {
        setBackendStatus('Disconnected');
        setBackendConnected(false);
        setDatabaseStatus('Disconnected');
        setDqnStatus('Disconnected');
      });
  };

  checkHealth();

  const intervalId = setInterval(checkHealth, 5000);

  return () => clearInterval(intervalId);
}, []);

  
useEffect(() => {
  fetch(`${API_BASE_URL}/api/patients`)
    .then((response) => {
      if (!response.ok) {
        throw new Error('Could not load patients');
      }
      return response.json();
    })
    .then((data) => {
      setPatients(data);
      setPatientError('');
    })
    .catch(() => {
      setPatientError('Unable to load patient records');
    });
}, []);

useEffect(() => {
  const fetchMetrics = async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/dashboard/metrics`
      );

      if (!response.ok) {
        throw new Error('Failed to load dashboard metrics');
      }

      const data = await response.json();
      setMetrics(data);
      setMetricsError('');
    } catch (error) {
      setMetricsError(error.message);
    }
  };

  fetchMetrics();

  const intervalId = setInterval(fetchMetrics, 10000);

  return () => clearInterval(intervalId);
}, []);

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>✚ MRI<span>Smart</span></h2>
        <p className="brand-subtitle">INTELLIGENT CARE</p>

        <p className="nav-label">WORKSPACE</p>
        <nav>
          <button
          className={`nav-item ${activePage === 'Dashboard' ? 'active' : ''}`}
          onClick={() => setActivePage('Dashboard')}
          >
          ▦ Dashboard
          </button>
          <button
          className={`nav-item ${activePage === 'Patient Queue' ? 'active' : ''}`}
          onClick={() => setActivePage('Patient Queue')}
          >
          ♙ Patient Queue
          </button>
          <button
          className={`nav-item ${activePage === 'MRI Schedule' ? 'active' : ''}`}
          onClick={() => setActivePage('MRI Schedule')}
>
          ▤ MRI Schedule
          </button>

          <button
          className={`nav-item ${activePage === 'AI Decisions' ? 'active' : ''}`}
          onClick={() => setActivePage('AI Decisions')}
          >
          ✳ AI Decisions
          </button>
          <button
          className={`nav-item ${activePage === 'Analytics' ? 'active' : ''}`}
          onClick={() => setActivePage('Analytics')}
          >
          ▥ Analytics
          </button>

        </nav>

        <div className="sidebar-footer">● Scheduling engine <span>Demo</span></div>
      </aside>

      <main className="main">
      
      {activePage === 'Patient Queue' ? (
      <>
      <header className="topbar">
       <div>
         <p className="eyebrow">HOSPITAL OPERATIONS / MRI</p>
         <h1>Patient Queue</h1>
         <p className="subtitle">
           Patients waiting for MRI scans
         </p>
       </div>
      <span className="live">● Live patient data</span>
     </header>

     <section className="section-heading">
      <div>
        <h2>Patient records</h2>
        <p>{patients.length} total patients</p>
      </div>
      <button
        className="primary-btn"
        onClick={() => setActivePage('Dashboard')}
      >
        Back to Dashboard
      </button>
     </section>

     {patientError && <p role="alert">{patientError}</p>}

     <section className="panel">
      {patients.length === 0 ? (
        <p>No patient records found. Add a test patient from the Dashboard.</p>
      ) : (
        <div className="mri-table-scroll">
          <table className="mri-schedule-table">
  <thead>
    <tr>
      <th style={{ padding: '12px' }}>Patient ID</th>
      <th style={{ padding: '12px' }}>Name</th>
      <th style={{ padding: '12px' }}>Priority</th>
      <th style={{ padding: '12px' }}>Scan</th>
      <th style={{ padding: '12px' }}>Status</th>
    </tr>
  </thead>
  <tbody>
    {patients.map((patient) => (
      <tr key={patient._id}>
        <td style={{ padding: '12px' }}>{patient.patientId}</td>
        <td style={{ padding: '12px' }}>{patient.name}</td>
        <td>
  <span
    className={`priority-badge priority-${(patient.priority || 'Normal').toLowerCase()}`}
  >
    {patient.priority || 'Normal'}
  </span>
</td>
        <td style={{ padding: '12px' }}>{patient.scanType}</td>
        <td>
          <select
            value={patient.status}
            onChange={async (event) => {
              const newStatus = event.target.value;
              try {
                const response = await fetch(
                  `${API_BASE_URL}/api/patients/${patient._id}/status`,
                  {
                    method: 'PATCH',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ status: newStatus }),
                  }
                );

                const data = await response.json();

                if (!response.ok) {
                  throw new Error(data.message || 'Status update failed');
                }

                setPatients((previousPatients) =>
                  previousPatients.map((item) =>
                    item._id === data._id ? data : item
                  )
                );

                setPatientError('');
              } catch (error) {
                setPatientError(error.message);
              }
            }}
          >
            <option value="Waiting">Waiting</option>
            <option value="Scheduled">Scheduled</option>
            <option value="Completed">Completed</option>
          </select>
        </td>
      </tr>
    ))}
  </tbody>
</table>
        </div>
      )}
    </section>
  </>

) : activePage === 'MRI Schedule' ? (
  <>
    <header className="topbar">
      <div>
        <p className="eyebrow">HOSPITAL OPERATIONS / MRI</p>
        <h1>MRI Schedule</h1>
        <p className="subtitle">
          View patients currently scheduled for MRI scans
        </p>
      </div>
      <span className="live">● Live patient data</span>
    </header>

    <section className="section-heading">
      <div>
        <h2>Scheduled scans</h2>
        <p>
          {patients.filter((patient) => patient.status === 'Scheduled').length}
          {' '}scheduled patients
        </p>
      </div>
      <button
        className="primary-btn"
        onClick={() => setActivePage('Patient Queue')}
      >
        View Patient Queue
      </button>
    </section>

    <section className="panel">
      {patients.filter((patient) => patient.status === 'Scheduled').length === 0 ? (
        <p>No scheduled patients yet. Update a patient's status in Patient Queue.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
  <thead>
    <tr>
      <th style={{ padding: '12px' }}>Patient ID</th>
      <th style={{ padding: '12px' }}>Name</th>
      <th style={{ padding: '12px' }}>Priority</th>
      <th style={{ padding: '12px' }}>Scan Type</th>
      <th style={{ padding: '12px' }}>Appointment Date</th>
      <th style={{ padding: '12px' }}>Start Time</th>
      <th style={{ padding: '12px' }}>End Time</th>
      <th style={{ padding: '12px' }}>Duration</th>
      <th style={{ padding: '12px' }}>Status</th>
    </tr>
  </thead>
  <tbody>
    {patients
      .filter((patient) => patient.status === 'Scheduled')
      .map((patient) => (
        <tr key={patient._id}>
          <td style={{ padding: '12px' }}>{patient.patientId}</td>
          <td style={{ padding: '12px' }}>{patient.name}</td>
          <td style={{ padding: '12px' }}>{patient.priority}</td>
          <td style={{ padding: '12px' }}>{patient.scanType}</td>
          <td style={{ padding: '12px' }}>
  {patient.scheduledStart
    ? new Date(patient.scheduledStart).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : 'Not assigned'}
</td>
          <td style={{ padding: '12px' }}>
            {patient.scheduledStart
              ? new Date(patient.scheduledStart).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Not assigned'}
          </td>
          <td style={{ padding: '12px' }}>
            {patient.scheduledEnd
              ? new Date(patient.scheduledEnd).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Not assigned'}
          </td>
          <td style={{ padding: '12px' }}>
            {patient.scanDuration || 20} min
          </td>
          <td>
  <span className="status-badge status-scheduled">
    {patient.status}
  </span>
</td>
        </tr>
      ))}
  </tbody>
</table>
        </div>
      )}
    </section>
  </>



) : activePage === 'AI Decisions' ? (

  <div style={{ padding: '30px', color: '#111827' }}>
    <h1>AI Decisions Page</h1>
    <p>The AI Decisions page is rendering correctly.</p>
    <p>
  DQN Status:{' '}
  <span
    style={{
      color: dqnStatus === 'Connected' ? '#16a34a' : '#dc2626',
      fontWeight: 'bold',
    }}
  >
    {dqnStatus}
  </span>
</p>
    <button
  type="button"
  onClick={handleRunDqn}
  disabled={dqnLoading}
>
  {dqnLoading ? 'Running DQN...' : 'Run AI Scheduling'}
</button>
<button
  type="button"
  onClick={handleRunDqnTest}
  disabled={dqnLoading}
  style={{
    marginLeft: '12px',
    padding: '10px 16px',
    borderRadius: '8px',
    border: '1px solid #2563eb',
    background: '#eff6ff',
    color: '#1d4ed8',
    cursor: dqnLoading ? 'not-allowed' : 'pointer',
  }}
>
  {dqnLoading ? 'Testing DQN...' : 'Test with Sample Patients'}
</button>
{dqnError && (
  <p style={{ color: 'red' }}>{dqnError}</p>
)}


{dqnResult && (
  <div
    style={{
      marginTop: '28px',
      maxWidth: '900px',
      padding: '24px',
      background: '#ffffff',
      borderRadius: '16px',
      border: '1px solid #e2e8f0',
      boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
      color: '#0f172a',
    }}
  >
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '24px',
      }}
    >
      <div>
        <h2 style={{ margin: 0, fontSize: '24px' }}>
          AI Scheduling Result
        </h2>
        <p style={{ color: '#64748b', marginBottom: 0 }}>
          DQN-powered patient recommendation
        </p>
      </div>

      <span
        style={{
          background: '#dcfce7',
          color: '#166534',
          padding: '8px 14px',
          borderRadius: '20px',
          fontSize: '13px',
          fontWeight: 600,
        }}
      >
        Decision received
      </span>
    </div>

    <div
      style={{
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '20px',
      }}
    >
      <p
        style={{
          color: '#1d4ed8',
          fontSize: '13px',
          fontWeight: 600,
          margin: '0 0 8px',
        }}
      >
        RECOMMENDED PATIENT
      </p>

      <h3 style={{ fontSize: '28px', margin: '0 0 12px' }}>
        {dqnResult.selected?.patient_id || 'N/A'}
      </h3>

      <span
        style={{
          display: 'inline-block',
          background:
            dqnResult.selected?.priority === 'Emergency'
              ? '#fee2e2'
              : '#dbeafe',
          color:
            dqnResult.selected?.priority === 'Emergency'
              ? '#b91c1c'
              : '#1d4ed8',
          padding: '6px 12px',
          borderRadius: '20px',
          fontSize: '13px',
          fontWeight: 600,
        }}
      >
        {dqnResult.selected?.priority || 'Priority unavailable'}
      </span>
    </div>

    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '14px',
        marginBottom: '22px',
      }}
    >
      {[
        {
          label: 'Waiting Time',
          value: dqnResult.selected?.waiting_time,
          suffix: ' min',
        },
        {
          label: 'Scan Duration',
          value: dqnResult.selected?.scan_duration,
          suffix: ' min',
        },
        {
          label: 'DQN Q-Value',
          value: dqnResult.selected?.q_value,
          suffix: '',
        },
        {
          label: 'Priority Score',
          value: dqnResult.selected?.priority_score,
          suffix: '',
        },
      ].map((item) => (
        <div
          key={item.label}
          style={{
            padding: '18px',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            background: '#f8fafc',
          }}
        >
          <p
            style={{
              color: '#64748b',
              fontSize: '13px',
              margin: '0 0 10px',
            }}
          >
            {item.label}
          </p>

          <h3 style={{ margin: 0, fontSize: '23px' }}>
            {item.value != null
              ? `${item.value}${item.suffix}`
              : 'N/A'}
          </h3>
        </div>
      ))}
    </div>

    <div
      style={{
        padding: '18px',
        background: '#f0fdf4',
        borderLeft: '4px solid #16a34a',
        borderRadius: '8px',
      }}
    >
      <h3 style={{ margin: '0 0 8px', fontSize: '16px' }}>
        Why was this patient selected?
      </h3>

<div style={{ marginTop: '28px' }}>
  <div style={{ marginBottom: '16px' }}>
    <h2 style={{ margin: '0 0 6px', fontSize: '21px' }}>
      Patient Comparison
    </h2>
    <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>
      Compare candidate patients evaluated by the DQN model.
    </p>
  </div>

  {Array.isArray(dqnResult.candidates) &&
  dqnResult.candidates.length > 0 ? (
    <div
      style={{
        overflowX: 'auto',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          textAlign: 'left',
          fontSize: '14px',
        }}
      >
        <thead>
          <tr style={{ background: '#f1f5f9', color: '#475569' }}>
            {[
              'Patient ID',
              'Priority',
              'Waiting Time',
              'Scan Duration',
              'Q-Value',
              'Rank',
              'Decision',
            ].map((heading) => (
              <th
                key={heading}
                style={{
                  padding: '14px 12px',
                  whiteSpace: 'nowrap',
                  fontWeight: 600,
                  borderBottom: '1px solid #e2e8f0',
                }}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {dqnResult.candidates.map((candidate, index) => (
            <tr
              key={`${candidate.patient_id || 'patient'}-${index}`}
              style={{
                background: candidate.selected ? '#f0fdf4' : '#ffffff',
              }}
            >
              <td style={{ padding: '14px 12px', fontWeight: 600 }}>
                {candidate.patient_id || 'N/A'}
              </td>

              <td style={{ padding: '14px 12px' }}>
                {candidate.priority || 'N/A'}
              </td>

              <td style={{ padding: '14px 12px' }}>
                {candidate.waiting_time != null
                  ? `${candidate.waiting_time} min`
                  : 'N/A'}
              </td>

              <td style={{ padding: '14px 12px' }}>
                {candidate.scan_duration != null
                  ? `${candidate.scan_duration} min`
                  : 'N/A'}
              </td>

              <td style={{ padding: '14px 12px' }}>
                {candidate.q_value != null
                  ? Number(candidate.q_value).toFixed(4)
                  : 'N/A'}
              </td>

              <td style={{ padding: '14px 12px' }}>
                {candidate.rank != null ? candidate.rank : 'N/A'}
              </td>

              <td style={{ padding: '14px 12px' }}>
                {candidate.selected ? (
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '5px 10px',
                      borderRadius: '20px',
                      background: '#dcfce7',
                      color: '#166534',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Selected
                  </span>
                ) : (
                  <span style={{ color: '#64748b' }}>
                    Not selected
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p
      style={{
        padding: '16px',
        background: '#f8fafc',
        borderRadius: '10px',
        color: '#64748b',
      }}
    >
      No candidate comparison data was returned by the DQN service.
    </p>
  )}
</div>

      <p style={{ margin: 0, lineHeight: 1.7, color: '#334155' }}>
        {dqnResult.explanation ||
          'The model returned a scheduling decision without an explanation.'}
      </p>
      
<div style={{ marginTop: '20px' }}>
  <button
    type="button"
    onClick={handleScheduleRecommendedPatient}
    disabled={scheduleLoading}
  >
    {scheduleLoading
      ? 'Scheduling...'
      : 'Schedule Recommended Patient'}
  </button>

  {scheduleMessage && (
    <p role="status">{scheduleMessage}</p>
  )}
</div>

    </div>
  </div>
)}

    
  </div>

) : activePage === 'Analytics' ? (
  <>
    <header className="topbar">
      <div>
        <p className="eyebrow">HOSPITAL OPERATIONS / MRI</p>
        <h1>Analytics</h1>
        <p className="subtitle">
          Patient workload and scheduling performance from available data
        </p>
      </div>
      <span className="live">● Live patient data</span>
    </header>

    <section className="metrics">
      <article className="metric-card">
        <p>Total patients</p>
        <h3>{patients.length}</h3>
        <span>Current database records</span>
      </article>

      <article className="metric-card">
        <p>Waiting</p>
        <h3>{patients.filter((p) => p.status === 'Waiting').length}</h3>
        <span>Awaiting scheduling</span>
      </article>

      <article className="metric-card">
        <p>Scheduled</p>
        <h3>{patients.filter((p) => p.status === 'Scheduled').length}</h3>
        <span>Scheduled for MRI</span>
      </article>

      <article className="metric-card">
        <p>Completed</p>
        <h3>{patients.filter((p) => p.status === 'Completed').length}</h3>
        <span>Completed scans</span>
      </article>
    </section>

    <section className="panel">
      <h2>Patient status breakdown</h2>
      {['Waiting', 'Scheduled', 'Completed'].map((status) => {
        const count = patients.filter((p) => p.status === status).length;
        const percentage = patients.length
          ? Math.round((count / patients.length) * 100)
          : 0;

        return (
          <div key={status} className="strategy">
            <div className="strategy-info">
              <b>{status}</b>
              <span>{count} patient(s) · {percentage}%</span>
            </div>
            <div className="bar-track">
              <div
                className="bar dqn"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="note">
        Calculated from current MongoDB patient records. Historical trends
        and DQN performance analytics are not connected yet.
      </p>
    </section>
  </>
) : (
    <>
        <header className="topbar">
          <div>
            <p className="eyebrow">HOSPITAL OPERATIONS / MRI</p>
            <h1>Dashboard</h1>
            <p className="subtitle">Intelligent MRI patient scheduling and monitoring</p>
          </div>
          <span className="live">● Simulation demo</span>
        </header>

        <section className="welcome">
          <div>
            <span className="welcome-tag">AI-POWERED SCHEDULING</span>
            <h2>Smarter scheduling.<br />Better patient care.</h2>
            <p>Monitor patient flow, MRI capacity and scheduling performance in one place.</p>
            <button className="primary-btn">View patient queue →</button>
          </div>
          <div className="scan-art">
            <div className="scan-ring"></div>
            <div className="scan-core">✚</div>
            <span>MRI INTELLIGENCE</span>
          </div>
        </section>

        <section className="section-heading">
          <div>
            <h2>Operations overview</h2>
            <p>Illustrative dashboard values</p>
          </div>
          <span className="date-chip">{new Date().toLocaleDateString()}</span>
        </section>

        <section className="metrics">
          
<article className="metric-card">
  <p>Total patients</p>
  <h3>{metrics ? metrics.totalPatients : 0}</h3>
  <span>Live count from MongoDB</span>
</article>

<article className="metric-card">
  <p>Waiting patients</p>
  <h3>{metrics ? metrics.waitingPatients : 0}</h3>
  <span>Patients awaiting MRI scheduling</span>
</article>

<article className="metric-card">
  <p>Scheduled patients</p>
  <h3>{metrics ? metrics.scheduledPatients : 0}</h3>
  <span>Patients scheduled for MRI</span>
</article>

<article className="metric-card">
  <p>Completed scans</p>
  <h3>{metrics ? metrics.completedPatients : 0}</h3>
  <span>Patients marked as completed</span>
</article>


          <article className="metric-card">
            <p>Average waiting time</p><h3>38.8 <small>min</small></h3>
            <span>Sample simulation result</span>
          </article>
          <article className="metric-card">
            <p>MRI utilization</p><h3>87.6<small>%</small></h3>
            <span>Sample machine utilization</span>
          </article>
          <article className="metric-card">
            <p>Scheduling engine</p><h3>Ready</h3>
            <span>AI integration pending</span>
          </article>
        </section>

<section className="panel patient-form-panel">
  <h2>Add Patient to Queue</h2>
  <p>Enter fictional test data to verify the database connection.</p>

  <form onSubmit={handleAddPatient} className="patient-form">
    <input
      type="text"
      placeholder="Patient ID (e.g. TEST001)"
      value={newPatient.patientId}
      onChange={(event) =>
        setNewPatient({ ...newPatient, patientId: event.target.value })
      }
      required
    />

    <input
      type="text"
      placeholder="Patient name"
      value={newPatient.name}
      onChange={(event) =>
        setNewPatient({ ...newPatient, name: event.target.value })
      }
      required
    />

    <select
      value={newPatient.priority}
      onChange={(event) =>
        setNewPatient({ ...newPatient, priority: event.target.value })
      }
    >
      <option value="Normal">Normal priority</option>
      <option value="High">High priority</option>
      <option value="Emergency">Emergency priority</option>
    </select>

    <button type="submit" className="primary-btn">
      Add Patient
    </button>
  </form>

  {patientError && <p role="alert">{patientError}</p>}
</section>

        <section className="bottom-grid">
          <article className="panel">
            <h2>Scheduling strategies</h2>
            <p>Example average waiting times</p>
            {[
              ['DQN', '38.80 min', '78%', 'dqn'],
              ['FIFO', '40.12 min', '80%', 'fifo'],
              ['Priority', '37.50 min', '75%', 'priority'],
            ].map(([name, time, width, type]) => (
              <div className="strategy" key={name}>
                <div className="strategy-info"><b>{name}</b><span>{time}</span></div>
                <div className="bar-track">
                  <div className={`bar ${type}`} style={{ width }}></div>
                </div>
              </div>
            ))}
            <p className="note">Illustrative comparison based on previous simulation results.</p>
          </article>

          <article className="panel">
            <h2>System status</h2>
            <div className="status-row">● React dashboard <b>Online</b></div>
            <div className="status-row">
             ● Express API
            <b style={{ color: backendConnected ? '#16a34a' : '#dc2626' }}>
            {backendStatus === 'healthy' ? 'Connected' : backendStatus}
            </b>
            </div>
            <div className="status-row">
            ● MongoDB
           <b style={{ color: databaseStatus === 'Connected' ? '#16a34a' : '#dc2626' }}>
           {databaseStatus}
           </b>
           </div>

            <div className="status-row">
  ● Python DQN
  <b style={{ color: dqnStatus === 'Connected' ? '#16a34a' : '#dc2626' }}>
    {dqnStatus}
  </b>
</div>
            <div className="next-step">
  <b>Scheduling Engine</b>
  <p>
    {dqnStatus === 'Connected'
      ? 'Your Python DQN scheduling engine is connected.'
      : 'Waiting for the Python DQN service to connect.'}
  </p>
</div>
          </article>
        </section>

       <footer>MRI Smart Scheduling <span>Academic project · Prototype interface</span></footer>

</>
)}
</main>
</div>
);
}

export default App