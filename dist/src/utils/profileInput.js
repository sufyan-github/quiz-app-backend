"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeProfileInput = sanitizeProfileInput;
const PROFILE_FIELDS = [
    'name', 'username', 'employeeId', 'rollNumber', 'regNumber', 'gender', 'dob', 'bloodGroup',
    'photo', 'coverPhoto', 'phone', 'altPhone', 'address', 'city', 'state', 'district', 'postalCode',
    'country', 'nationality', 'institution', 'department', 'program', 'semester', 'batch', 'session',
    'academicYear', 'designation', 'employeeType', 'joiningDate', 'experience', 'skills', 'qualification',
    'orgName', 'orgLogo', 'orgWebsite', 'shortBio', 'aboutMe', 'interests', 'careerGoal', 'linkedin',
    'github', 'portfolio', 'facebook', 'twitter',
];
function sanitizeProfileInput(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        return {};
    const source = input;
    const result = {};
    for (const field of PROFILE_FIELDS) {
        if (!(field in source))
            continue;
        const value = source[field];
        if (field === 'dob' || field === 'joiningDate') {
            if (typeof value === 'string' && !Number.isNaN(Date.parse(value)))
                result[field] = new Date(value);
            else if (value === null)
                result[field] = null;
            continue;
        }
        if (typeof value === 'string')
            result[field] = value.trim().slice(0, 2000);
        else if (value === null)
            result[field] = null;
    }
    return result;
}
