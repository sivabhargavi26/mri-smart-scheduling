
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const Patient = require('./models/Patient');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const DQN_API_URL =
  process.env.DQN_API_URL || 'http://127.0.0.1:5001';
const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mri_scheduling';
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose
    .connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected successfully!');
  })
  .catch((error) => {
    console.error('MongoDB connection failed:', error.message);
  });

// Home route
app.get('/', (req, res) => {
  res.json({
    message: 'MRI Smart Scheduling API is running!',
    status: 'success',
  });
});

// Health check

app.get('/api/health', async (req, res) => {
  let dqnIntegration = 'Disconnected';

  try {
    const response = await fetch(DQN_API_URL, {
      signal: AbortSignal.timeout(3000),
    });

    if (response.ok) {
      dqnIntegration = 'Connected';
    }
  } catch (error) {
    dqnIntegration = 'Disconnected';
  }

  res.json({
    status: 'healthy',
    application: 'MRI Smart Scheduling',
    backend: 'Express',
    database:
      mongoose.connection.readyState === 1
        ? 'Connected'
        : 'Not connected',
    dqnIntegration,
  });
});


/* Connect to the existing Python DQN scheduler */
app.post('/api/dqn/schedule', async (req, res) => {
  try {
    console.log('DQN request sent to:', `${DQN_API_URL}/api/schedule`);

    const response = await fetch(`${DQN_API_URL}/api/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const responseText = await response.text();

    console.log('Python DQN status:', response.status);
    console.log('Python DQN content type:', response.headers.get('content-type'));
    console.log('Python DQN response:', responseText.slice(0, 1000));

    let data;

    try {
      data = JSON.parse (responseText);
    } catch {
      return res.status(502).json({
        message: 'Python DQN returned a non-JSON response.',
        pythonStatus: response.status,
        responsePreview: responseText.slice(0, 300),
      });
    }

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.json(data);
  } catch (error) {
    console.error('DQN connection error:', error);

    return res.status(502).json({
      message: 'Could not connect to the Python DQN service.',
      details: error.message,
    });
  }
});
app.post('/api/dqn/full-schedule', async (req, res) => {
  const session = await mongoose.startSession();

  try {
    console.log('DEBUG: Starting MongoDB transaction');
    console.log(
      'Full schedule request sent to:',
      `${DQN_API_URL}/api/full_schedule`
    );

    // Get the DQN schedule from the Python service.
    const response = await fetch(
      `${DQN_API_URL}/api/full_schedule`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body),
      }
    );

    const responseText = await response.text();

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      return res.status(502).json({
        message: 'Python DQN returned a non-JSON response.',
        responsePreview: responseText.slice(0, 300),
      });
    }

    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    console.log('DEBUG: Python DQN schedule received:', data.schedule);
    if (!response.ok) {
   return res.status(response.status).json(data);
   }
    console.log('DEBUG: Schedule entries:', data.schedule?.length);
    if (!Array.isArray(data.schedule)) {
      return res.status(502).json({
        message: 'Python DQN response does not contain a valid schedule array.',
      });
    }

    // No waiting patients were scheduled.
    if (data.schedule.length === 0) {
      return res.json({
        ...data,
        message: 'The DQN returned an empty schedule. No patients were updated.',
      });
    }

    // Validate the complete schedule before changing the database.
    const seenPatientIds = new Set();

    for (const item of data.schedule) {
      const patientId = String(item.patient_id ?? '').trim();
      const startTime = Number(item.start_time);
      const endTime = Number(item.end_time);

      if (
        !patientId ||
        seenPatientIds.has(patientId) ||
        !Number.isFinite(startTime) ||
        !Number.isFinite(endTime) ||
        startTime < 0 ||
        endTime <= startTime
      ) {
        return res.status(502).json({
          message: 'The DQN returned invalid or duplicate scheduling entries.',
        });
      }

      seenPatientIds.add(patientId);
    }

    // This scheduler uses minutes relative to the start of its schedule.
    // Convert them into real appointment timestamps.
    const scheduleStart = new Date();
    const updates = [];

    for (const item of data.schedule) {
      const patientId = String(item.patient_id).trim();

      // Only update patients that are still waiting.
      const patient = await Patient.findOne({
        patientId,
        status: 'Waiting',
      }).session(session);

      if (!patient) {
        return res.status(409).json({
          message:
            `Patient ${patientId} is no longer waiting or does not exist. ` +
            'No schedule updates were committed. Refresh the patient queue and try again.',
        });
      }

      const startMinutes = Number(item.start_time);
      const endMinutes = Number(item.end_time);

      const scheduledStart = new Date(
        scheduleStart.getTime() + startMinutes * 60000
      );

      const scheduledEnd = new Date(
        scheduleStart.getTime() + endMinutes * 60000
      );

      // Check the returned duration against the patient's scan duration.
      const expectedDuration = Number(patient.scanDuration || 20);

      if (
        !Number.isFinite(expectedDuration) ||
        expectedDuration <= 0 ||
        Math.abs(
          (scheduledEnd.getTime() - scheduledStart.getTime()) / 60000 -
            expectedDuration
        ) > 0.01
      ) {
        return res.status(502).json({
          message:
            `Invalid scan duration returned for patient ${patientId}. ` +
            'No schedule updates were committed.',
        });
      }

      updates.push({
        patient,
        scheduledStart,
        scheduledEnd,
      });
    }

    // Commit all patient updates together.
    await session.withTransaction(async () => {
      console.log('DEBUG: Saving appointments:', updates.length);
      for (const update of updates) {
        const result = await Patient.updateOne(
          {
            _id: update.patient._id,
            status: 'Waiting',
          },
          {
            $set: {
              status: 'Scheduled',
              scheduledStart: update.scheduledStart,
              scheduledEnd: update.scheduledEnd,
            },
          },
          { session }
        );

        if (result.modifiedCount !== 1) {
          throw new Error(
            `Patient ${update.patient.patientId} changed before the schedule could be saved.`
          );
        }
      }
    });

    console.log(
      `Saved ${updates.length} DQN appointments to MongoDB.`
    );

    return res.json({
      ...data,
      message: 'DQN schedule generated and saved successfully.',
      savedPatients: updates.length,
    });
  } catch (error) {
    console.error('Full-schedule error:', error);

    return res.status(500).json({
      message: 'Could not generate and save the full MRI schedule.',
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
});

/* TEMPORARY: Assign missing MRI times to existing scheduled patients */
app.post('/api/schedule/repair-missing-times', async (req, res) => {
  try {
    const scheduledPatients = await Patient.find({
      status: 'Scheduled',
    }).sort({ createdAt: 1 });

    let nextStart = new Date();
    const repaired = [];

    for (const patient of scheduledPatients) {
      // Preserve any existing complete appointment.
      if (patient.scheduledStart && patient.scheduledEnd) {
        nextStart = new Date(
          Math.max(nextStart.getTime(), patient.scheduledEnd.getTime())
        );
        continue;
      }

      const duration = patient.scanDuration || 20;
      const start = new Date(nextStart);
      const end = new Date(start.getTime() + duration * 60000);

      patient.scanDuration = duration;
      patient.scheduledStart = start;
      patient.scheduledEnd = end;

      await patient.save();

      repaired.push({
        patientId: patient.patientId,
        scheduledStart: start,
        scheduledEnd: end,
      });

      nextStart = end;
    }

    res.json({
      message: 'Missing MRI appointment times repaired.',
      repaired,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Could not repair missing MRI appointment times.',
      error: error.message,
    });
  }
});

// Dashboard metrics
app.get('/api/dashboard/metrics', async (req, res) => {
  try {
    const totalPatients = await Patient.countDocuments();
    const waitingPatients = await Patient.countDocuments({
      status: 'Waiting',
    });
    const scheduledPatients = await Patient.countDocuments({
      status: 'Scheduled',
    });
    const completedPatients = await Patient.countDocuments({
      status: 'Completed',
    });

    res.json({
      totalPatients,
      waitingPatients,
      scheduledPatients,
      completedPatients,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Could not load dashboard metrics',
    });
  }
});
// Get all patient records
app.get('/api/patients', async (req, res) => {
  try {
    const patients = await Patient.find().sort({ createdAt: -1 });
    res.status(200).json(patients);
  } catch (error) {
    console.error('Error fetching patient records:', error);
    res.status(500).json({
      message: 'Failed to fetch patient records',
      error: error.message,
    });
  }
});
// Add a patient
app.post('/api/patients', async (req, res) => {
  try {
    const patient = await Patient.create(req.body);
    res.status(201).json(patient);
  } catch (error) {
    res.status(400).json({
      message: 'Failed to create patient',
      error: error.message,
    });
  }
});

// Update patient status

/* Assign an available MRI time slot */
app.patch('/api/patients/:id/schedule', async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);

    if (!patient) {
      return res.status(404).json({
        message: 'Patient not found',
      });
    }

    if (patient.status !== 'Waiting') {
      return res.status(400).json({
        message: 'Only waiting patients can be scheduled.',
      });
    }

    const duration = patient.scanDuration || 20;

if (!Number.isFinite(duration) || duration <= 0) {
  return res.status(400).json({
    message: 'Scan duration must be a positive number.',
  });
}

// Start searching from the current time.
let start = new Date();
let end = new Date(start.getTime() + duration * 60000);

    // Find an available slot without overlapping an existing
    // appointment that already has start and end times.
    while (true) {
      const conflict = await Patient.findOne({
  _id: { $ne: patient._id },
  status: 'Scheduled',
  scheduledStart: { $exists: true, $ne: null, $lt: end },
  scheduledEnd: { $exists: true, $ne: null, $gt: start },
}).sort({ scheduledEnd: 1 });

      if (!conflict) {
        break;
      }

      // Try again immediately after the conflicting appointment.
      start = new Date(conflict.scheduledEnd);
      end = new Date(start.getTime() + duration * 60000);
    }

    patient.status = 'Scheduled';
    patient.scheduledStart = start;
    patient.scheduledEnd = end;

    await patient.save();

    res.json({
      message: 'MRI slot assigned successfully.',
      patient,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Could not assign an MRI slot.',
      error: error.message,
    });
  }
});

console.log(
  'Express router:',
  typeof app.router,
  'Stack:',
  app.router?.stack?.map((layer) => ({
    path: layer.route?.path || layer.name,
    methods: layer.route ? Object.keys(layer.route.methods) : [],
  }))
);
console.log('DASHBOARD METRICS ROUTE VERSION LOADED');
// Start server
app.listen(PORT, () => {
  console.log(`MRI Smart API running at http://localhost:${PORT}`);
});
