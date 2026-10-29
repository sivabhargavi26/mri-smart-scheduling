
const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema(
  {
    patientId: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    priority: {
      type: String,
      enum: ['Emergency', 'High', 'Normal'],
      default: 'Normal',
    },
    scanType: {
      type: String,
      default: 'MRI',
    },
    status: {
      type: String,
      enum: ['Waiting', 'Scheduled', 'Completed'],
      default: 'Waiting',
    },
    waitingTime: {
      type: Number,
      default: 0,
    },

    // MRI appointment details
    scanDuration: {
      type: Number,
      default: 20,
      min: 1,
    },
    scheduledStart: {
      type: Date,
      default: null,
    },
    scheduledEnd: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Patient', patientSchema);
