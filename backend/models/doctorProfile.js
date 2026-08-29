const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// This is the ONE model in JustAsk LK that holds a real identity — and it is
// the professional's, never the patient's. See Section 9 of the proposal:
// "Anonymity is one-directional, not mutual."
//
// The patient never receives fullName, email, slmcNumber, or passwordHash.
// toPublicProfile() below controls exactly what may leave the server.
const doctorProfileSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },

  // Never stored in plain text. Hashed by the pre-save hook below.
  passwordHash: { type: String, required: true },

  slmcNumber: { type: String, required: true, unique: true, trim: true },

  specialisation: { type: String, required: true, trim: true },

  // A doctor CANNOT receive any patient chat until an administrator sets this.
  // Registration alone is not verification — see Section 5, "trust is verified,
  // not assumed".
  verified: { type: Boolean, default: false },

  // Doctor toggles this when they are ready to take sessions.
  available: { type: Boolean, default: false },

  // Practice details shown on the in-person referral card. These describe the
  // DOCTOR's practice, never the patient.
  clinicName: { type: String, default: '' },
  clinicArea: { type: String, default: '' },
  bookingInfo: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now },
});

// Hash the password whenever it is set or changed.
// Note: async middleware in Mongoose 7+ does not receive a `next` callback —
// returning (or throwing) is what signals completion.
doctorProfileSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
});

doctorProfileSchema.methods.checkPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

// What the DOCTOR sees about themselves after logging in.
doctorProfileSchema.methods.toDoctorSelf = function () {
  return {
    id: this._id,
    fullName: this.fullName,
    specialisation: this.specialisation,
    verified: this.verified,
    available: this.available,
    clinicName: this.clinicName,
  };
};

// The only shape a PATIENT is ever allowed to receive.
// Note what is absent: fullName, email, slmcNumber, passwordHash.
doctorProfileSchema.methods.toPublicProfile = function () {
  return {
    badge: `Verified Doctor \u2014 ${this.specialisation}`,
    specialisation: this.specialisation,
    referral: this.clinicName
      ? { clinic: this.clinicName, area: this.clinicArea, booking: this.bookingInfo }
      : null,
  };
};

module.exports = mongoose.model('DoctorProfile', doctorProfileSchema);
