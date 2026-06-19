const mongoose = require('mongoose');

const billSchema = mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    month: {
        type: String,
        required: true
    },
    year: {
        type: Number,
        required: true
    },
    targetFlat: {
        type: String,
        default: 'All'
    },
    attachmentPath: {
        type: String
    },
    status: {
        type: String,
        enum: ['unpaid', 'paid'],
        default: 'unpaid'
    }
}, {
    timestamps: true
});

const societySchema = mongoose.Schema(
    {
        societyName: {
            type: String,
            unique: true,
            required: true
        },
        societyEmail: {
            type: String,
            default: 'quisoft.in@gmail.com'
        },
        societyPhone: {
            type: String,
            default: '9888877777'
        },
        helpdeskName: {
            type: String,
            default: 'Resident Care Desk'
        },
        helpdeskPhone: {
            type: String,
            default: '080-12345678'
        },
        bills: [billSchema],
        societyAddress: {
            address: {
                type: String,
                required: true
            },
            city: {
                type: String,
                required: true
            },
            district: {
                type: String,
                required: true
            },
            postalCode: {
                type: Number,
                required: true
            }
        },
        admin: {
            type: String,
            required: true
        },
        activeAGM: {
            type: String
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'suspended'],
            default: 'pending'
        },
        subscriptionPlan: {
            type: String,
            enum: ['bronze', 'silver', 'gold', 'enterprise'],
            default: 'bronze'
        },
        storageQuotaMb: {
            type: Number,
            default: 500 // 500MB limit for free/bronze plan
        },
        storageUsedMb: {
            type: Number,
            default: 0
        },
        noticeboard: {
            type: Array,
            default: []
        },
        emergencyContacts: {
            plumbingService: {
                type: String,
                default: 'Not added by admin'
            },
            medicineShop: {
                type: String,
                default: 'Not added by admin'
            },
            ambulance: {
                type: String,
                default: 'Not added by admin'
            },
            doctor: {
                type: String,
                default: 'Not added by admin'
            },
            fireStation: {
                type: String,
                default: 'Not added by admin'
            },
            guard: {
                type: String,
                default: 'Not added by admin'
            },
            policeStation: {
                type: String,
                default: 'Not added by admin'
            }
        },
        maintenanceBill: {
            societyCharges: {
                type: Number,
                default: 200
            },
            repairsAndMaintenance: {
                type: Number,
                default: 1200
            },
            sinkingFund: {
                type: Number,
                default: 250
            },
            waterCharges: {
                type: Number,
                default: 150
            },
            insuranceCharges: {
                type: Number,
                default: 50
            },
            parkingCharges: {
                type: Number,
                default: 150
            },
        }
    },
    {
		timestamps: true,
	}
)

exports.Society = mongoose.model("society", societySchema);