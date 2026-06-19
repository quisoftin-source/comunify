const mongoose = require('mongoose');
const passportLocalMongoose = require('passport-local-mongoose');
const passport = require('passport');

const userSchema = new mongoose.Schema (
	{
		validation: {
			type: String,
			required: true,
			default: 'applied'
		},
		role: {
			type: String,
			enum: ['super_admin', 'society_admin', 'security_guard', 'committee_member', 'owner', 'tenant', 'resident'],
			default: 'resident'
		},
		isAdmin: {
			type: Boolean,
			required: true,
			default: false
		},
		societyName: {
			type: String,
			required: false // Optional for super admin
		},
		flatNumber: {
			type: String,
			required: false // Optional for super admin, guard
		},
		firstName: {
			type: String,
			required: true
		},
		lastName: {
			type: String,
			required: true
		},
		phoneNumber: {
			type: Number,
			required: true
		},
		familyMembers: [{
			name: String,
			relation: String,
			phoneNumber: String
		}],
		complaints: {
			type: Array,
			default: []
		},
		lastPayment: {
			date: Date,
			amount: Number,
			invoice: String
		},
		makePayment: {
			type: Number,
			default: 0
		},
		fatherName: {
			type: String
		},
		occupancyType: {
			type: String,
			enum: ['owner', 'renter'],
			default: 'owner'
		},
		kidsCount: {
			type: Number,
			default: 0
		},
		kidsNames: {
			type: [String],
			default: []
		},
		ownerPhoneNumber: {
			type: Number
		},
		additionalInfo: {
			type: String
		},
		photoPath: {
			type: String
		},
		rentAgreementPath: {
			type: String
		},
		fourWheelerCount: {
			type: Number,
			default: 0
		},
		fourWheelerNumbers: {
			type: String,
			default: ''
		},
		twoWheelerCount: {
			type: Number,
			default: 0
		},
		twoWheelerNumbers: {
			type: String,
			default: ''
		},
		bicycleCount: {
			type: Number,
			default: 0
		}
	},
	{
		timestamps: true
	}
);

userSchema.plugin(passportLocalMongoose);
const User = mongoose.model("User", userSchema);

// Check if strategies are already configured to avoid recompiling in fast reloads
if (!passport.strategies || !passport.strategies.local) {
	passport.use(User.createStrategy());
	passport.serializeUser(User.serializeUser());
	passport.deserializeUser(User.deserializeUser());
}

exports.User = User;