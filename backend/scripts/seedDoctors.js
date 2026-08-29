// seedDoctors.js
// Creates verified demo doctor accounts you can log in with.
// Safe to re-run — existing accounts are updated, not duplicated.
//
// Run from the backend folder:  node scripts/seedDoctors.js

require('dotenv').config();
const mongoose = require('mongoose');
const DoctorProfile = require('../models/doctorProfile');

const DEMO_DOCTORS = [
  {
    fullName: 'Dr. A. Perera',
    email: 'perera@justask.lk',
    password: 'demo12345',
    slmcNumber: 'DEMO-SLMC-1001',
    specialisation: 'General Practice',
    clinicName: 'Colombo General Hospital',
    clinicArea: 'Colombo 03',
    bookingInfo: 'Walk-in, OPD 8am-4pm',
  },
  {
    fullName: 'Dr. S. Fernando',
    email: 'fernando@justask.lk',
    password: 'demo12345',
    slmcNumber: 'DEMO-SLMC-1002',
    specialisation: 'Psychiatry',
    clinicName: 'National Institute of Mental Health',
    clinicArea: 'Angoda',
    bookingInfo: 'Call for an appointment',
  },
];

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    for (const d of DEMO_DOCTORS) {
      let doc = await DoctorProfile.findOne({ email: d.email });

      if (doc) {
        Object.assign(doc, {
          fullName: d.fullName,
          specialisation: d.specialisation,
          clinicName: d.clinicName,
          clinicArea: d.clinicArea,
          bookingInfo: d.bookingInfo,
          verified: true,
          available: true,
        });
        doc.passwordHash = d.password; // re-hashed by the pre-save hook
        await doc.save();
        console.log(`  updated  ${d.email}`);
      } else {
        await DoctorProfile.create({
          ...d,
          passwordHash: d.password,
          verified: true,
          available: true,
        });
        console.log(`  created  ${d.email}`);
      }
    }

    const count = await DoctorProfile.countDocuments({ verified: true });
    console.log(`\nVerified doctors: ${count}`);
    console.log('\nSign in at /doctor with:');
    DEMO_DOCTORS.forEach((d) => console.log(`  ${d.email}  /  ${d.password}`));
    console.log('\nThese are demo credentials. Never use them in a real deployment.');
  } catch (err) {
    console.error('Seed failed:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
})();
