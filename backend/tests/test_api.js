const axios = require('axios');

const testData = {
    header: {
        academicYear: '2025 – 26',
        ciaType: '1',
        courseCode: 'CS101',
        courseTitle: 'Introduction to Computer Science',
        programme: 'B.E. CSE',
        semester: 'Fourth',
        date: '2026-02-18',
        session: 'FN',
    },
    partA: Array(6).fill(0).map((_, i) => ({
        qNo: `${i + 1}`,
        text: `Test Question Part A ${i + 1}`,
        co: 'CO1',
        btl: 'L1',
    })),
    partB: [7, 8, 9].map(qNo => ({
        qNo: `${qNo}`,
        a: { text: `Test Question Part B ${qNo}a`, co: 'CO1', btl: 'L1' },
        b: { text: `Test Question Part B ${qNo}b`, co: 'CO1', btl: 'L1' },
    })),
};

axios.post('http://localhost:5000/api/papers', testData)
    .then(res => console.log('Success:', res.data))
    .catch(err => console.error('Error:', err.response?.data || err.message));
