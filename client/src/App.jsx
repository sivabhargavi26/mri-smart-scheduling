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

    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      const errorText = await response.text();
      console.error('Expected JSON but received:', errorText.slice(0, 300));
      throw new Error(
        `The API returned an unexpected response (HTTP ${response.status}). Check the API URL.`
      );
    }

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
    console.error('Add patient error:', error);
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
const handleGenerateFullSchedule = async () => {
  setDqnLoading(true);
  setDqnError('');
  setDqnResult(null);

  try {
    const waitingPatients = patients.filter(
      (patient) =>
        String(patient.status || '').trim().toLowerCase() === 'waiting'
    );

    if (waitingPatients.length === 0) {
      throw new Error(
        'No waiting patients found. Please add a patient with Waiting status.'
      );
    }

    const dqnPatients = waitingPatients.map((patient) => ({
      patient_id: patient.patientId,
      arrival_time: Number(patient.arrivalTime ?? 0),
      priority: patient.priority,
      waiting_time: Number(patient.waitingTime ?? 0),
      scan_duration: Number(patient.scanDuration ?? 20),
    }));

    const response = await fetch(
      `${API_BASE_URL}/api/dqn/full-schedule`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          current_time: 0,
          patients: dqnPatients,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
          data.message ||
          'Could not generate the full MRI schedule.'
      );
    }

    setDqnResult(data);
  } catch (error) {
    setDqnError(error.message || 'An unexpected error occurred.');
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
  onClick={handleGenerateFullSchedule}
  disabled={dqnLoading}
  style={{
    marginLeft: '12px',
    padding: '10px 16px',
    borderRadius: '8px',
    border: '1px solid #16a34a',
    background: '#f0fdf4',
    color: '#166534',
    cursor: dqnLoading ? 'not-allowed' : 'pointer',
  }}
>
  {dqnLoading ? 'Generating...' : 'Generate Full Schedule'}
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
      maxWidth: '1100px',
      padding: '24px',
      background: '#ffffff',
      borderRadius: '16px',
      border: '1px solid #e2e8f0',
      boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
      color: '#0f172a',
    }}
  >
    {Array.isArray(dqnResult.schedule) ? (
      <>
        {/* FULL DQN SCHEDULE */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ margin: 0, fontSize: '26px' }}>
            Full MRI Schedule
          </h2>
          <p style={{ color: '#64748b', lineHeight: 1.6 }}>
            The DQN model generated a schedule for the waiting patients.
          </p>

          <span
            style={{
              display: 'inline-block',
              padding: '7px 12px',
              background: '#dcfce7',
              color: '#166534',
              borderRadius: '20px',
              fontWeight: 600,
              fontSize: '13px',
            }}
          >
            Schedule generated successfully
          </span>
        </div>

        {/* METRICS */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '14px',
            marginBottom: '28px',
          }}
        >
          {[
            {
              label: 'Patients Scheduled',
              value: dqnResult.metrics?.patients_scheduled ?? dqnResult.schedule.length,
              suffix: '',
            },
            {
              label: 'Average Waiting Time',
              value: dqnResult.metrics?.average_wait,
              suffix: ' min',
            },
            {
              label: 'Maximum Waiting Time',
              value: dqnResult.metrics?.maximum_wait,
              suffix: ' min',
            },
            {
              label: 'MRI Utilization',
              value: dqnResult.metrics?.mri_utilization,
              suffix: '%',
            },
            {
              label: 'Total Scan Time',
              value: dqnResult.metrics?.total_scan_time,
              suffix: ' min',
            },
            {
              label: 'MRI Idle Time',
              value: dqnResult.metrics?.idle_time,
              suffix: ' min',
            },
          ].map((metric) => (
            <div
              key={metric.label}
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
                {metric.label}
              </p>
              <h3 style={{ margin: 0, fontSize: '23px' }}>
                {metric.value != null
                  ? `${metric.value}${metric.suffix}`
                  : 'N/A'}
              </h3>
            </div>
          ))}
        </div>

        {/* FULL SCHEDULE TABLE */}
        <h3 style={{ marginBottom: '14px' }}>
          Patient Appointment Schedule
        </h3>

        {dqnResult.schedule.length > 0 ? (
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
                    'Slot',
                    'Patient ID',
                    'Priority',
                    'Scan Duration',
                    'Start Time',
                    'End Time',
                    'Waiting Time',
                    'Q-Value',
                  ].map((heading) => (
                    <th
                      key={heading}
                      style={{
                        padding: '14px 12px',
                        whiteSpace: 'nowrap',
                        borderBottom: '1px solid #e2e8f0',
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {dqnResult.schedule.map((item, index) => (
                  <tr
                    key={`${item.patient_id || 'patient'}-${index}`}
                    style={{
                      background: index % 2 === 0 ? '#ffffff' : '#f8fafc',
                    }}
                  >
                    <td style={{ padding: '13px 12px' }}>
                      {item.slot ?? index + 1}
                    </td>
                    <td
                      style={{
                        padding: '13px 12px',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.patient_id || 'N/A'}
                    </td>
                    <td style={{ padding: '13px 12px' }}>
                      <span
                        style={{
                          padding: '5px 9px',
                          borderRadius: '16px',
                          background:
                            item.priority === 'Emergency'
                              ? '#fee2e2'
                              : item.priority === 'High'
                                ? '#fef3c7'
                                : '#dbeafe',
                          color:
                            item.priority === 'Emergency'
                              ? '#b91c1c'
                              : item.priority === 'High'
                                ? '#92400e'
                                : '#1d4ed8',
                          fontWeight: 600,
                        }}
                      >
                        {item.priority || 'Normal'}
                      </span>
                    </td>
                    <td style={{ padding: '13px 12px' }}>
                      {item.scan_duration ?? 'N/A'}
                      {item.scan_duration != null ? ' min' : ''}
                    </td>
                    <td style={{ padding: '13px 12px' }}>
                      {item.start_time ?? 'N/A'}
                    </td>
                    <td style={{ padding: '13px 12px' }}>
                      {item.end_time ?? 'N/A'}
                    </td>
                    <td style={{ padding: '13px 12px' }}>
                      {item.waiting_time ?? 'N/A'}
                      {item.waiting_time != null ? ' min' : ''}
                    </td>
                    <td style={{ padding: '13px 12px' }}>
                      {item.q_value != null
                        ? Number(item.q_value).toFixed(3)
                        : 'N/A'}
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
            The DQN service returned an empty schedule.
          </p>
        )}

        {/* DQN DECISIONS */}
        <div style={{ marginTop: '28px' }}>
          <h3>DQN Scheduling Decisions</h3>

          {Array.isArray(dqnResult.decisions) &&
          dqnResult.decisions.length > 0 ? (
            dqnResult.decisions.map((decision, index) => (
              <div
                key={`${decision.selected_patient || 'decision'}-${index}`}
                style={{
                  padding: '16px',
                  marginBottom: '12px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '10px',
                }}
              >
                <strong>
                  Slot {index + 1}: {decision.selected_patient || 'Patient'}
                </strong>

                <p style={{ margin: '8px 0', color: '#334155' }}>
                  {decision.explanation || 'No explanation was provided.'}
                </p>

                <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
                  Priority: {decision.priority || 'N/A'}
                  {' | '}
                  Start: {decision.start_time ?? 'N/A'}
                  {' | '}
                  End: {decision.end_time ?? 'N/A'}
                </p>
              </div>
            ))
          ) : (
            <p style={{ color: '#64748b' }}>
              No decision details were returned.
            </p>
          )}
        </div>
      </>
    ) : (
      <>
        {/* EXISTING SINGLE-PATIENT RECOMMENDATION */}
        <h2 style={{ marginTop: 0 }}>AI Scheduling Result</h2>
        <p style={{ color: '#64748b' }}>
          DQN-powered patient recommendation
        </p>

        <div
          style={{
            padding: '20px',
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '12px',
            marginBottom: '20px',
          }}
        >
          <p style={{ color: '#1d4ed8', fontWeight: 600 }}>
            RECOMMENDED PATIENT
          </p>

          <h3 style={{ fontSize: '28px', margin: '0 0 12px' }}>
            {dqnResult.selected?.patient_id || 'N/A'}
          </h3>

          <p>
            Priority: {dqnResult.selected?.priority || 'N/A'}
          </p>

          <p>
            Waiting Time: {dqnResult.selected?.waiting_time ?? 'N/A'} min
          </p>

          <p>
            Scan Duration: {dqnResult.selected?.scan_duration ?? 'N/A'} min
          </p>

          <p>
            Q-Value: {dqnResult.selected?.q_value ?? 'N/A'}
          </p>

          <p>
            {dqnResult.explanation ||
              'The model returned a recommendation.'}
          </p>
        </div>

        <h3>Patient Comparison</h3>

        {Array.isArray(dqnResult.candidates) &&
        dqnResult.candidates.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
              }}
            >
              <thead>
                <tr>
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
                        padding: '12px',
                        background: '#f1f5f9',
                        whiteSpace: 'nowrap',
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
                    <td style={{ padding: '12px' }}>
                      {candidate.patient_id || 'N/A'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {candidate.priority || 'N/A'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {candidate.waiting_time ?? 'N/A'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {candidate.scan_duration ?? 'N/A'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {candidate.q_value != null
                        ? Number(candidate.q_value).toFixed(3)
                        : 'N/A'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {candidate.rank ?? 'N/A'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {candidate.selected ? 'Selected' : 'Not selected'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: '#64748b' }}>
            No candidate comparison data was returned.
          </p>
        )}

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

          {scheduleMessage && <p role="status">{scheduleMessage}</p>}
        </div>
      </>
    )}
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