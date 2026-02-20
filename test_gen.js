const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function test() {
    try {
        const response = await axios.post('http://172.27.53.175:5000/api/papers', {
            header: {
                academicYear: "2023-2024",
                courseCode: "TEST101",
                courseTitle: "Unit Testing",
                ciaType: "1",
                programme: "B.E - CSE",
                semester: "Sixth",
                date: "2024-02-20",
                session: "FN"
            },
            partA: [
                { qNo: "1", text: "What is alpha^2?", co: "CO1", btl: "L1" }
            ],
            partB: [
                {
                    qNo: "7",
                    a: { text: "Explain sqrt(x)", subdivisions: [], co: "CO1", btl: "L2" },
                    b: { text: "Explain sum of i", subdivisions: [{ label: "i)", text: "Part 1", marks: "8" }, { label: "ii)", text: "Part 2", marks: "8" }], co: "CO1", btl: "L2" }
                }
            ],
            fileName: "TEST101-Unit Testing-CIA1"
        });
        console.log('Success:', response.data);
    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
    }
}
test();
