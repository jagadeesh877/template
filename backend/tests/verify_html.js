const fs = require('fs');

const paper = {
    ciaType: '1',
    academicYear: '2025 – 26',
    semester: 'Fourth',
    programme: 'B.E. Computer Science and Engineering',
    courseCode: 'CCS336',
    courseTitle: 'Cloud Services Management',
    date: '2026-02-19',
    session: 'FN'
};

const toRoman = (num) => {
    const map = { '1': 'I', '2': 'II', '3': 'III' };
    return map[num] || num;
};

const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
};

const getSemesterType = (semStr) => {
    const evenSemesters = ['Second', 'Fourth', 'Sixth', 'Eighth', '2', '4', '6', '8'];
    const isEven = evenSemesters.some(s => semStr.toLowerCase().includes(s.toLowerCase()));
    return isEven ? "Even Semester" : "Odd Semester";
};

const ciaRoman = toRoman(paper.ciaType);
const semesterType = getSemesterType(paper.semester);
const formattedDate = formatDate(paper.date);

const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: "Times New Roman", Times, serif; font-size: 11pt; line-height: 1.2; padding: 20px; }
        .header-section { text-align: center; margin-bottom: 15px; }
        .college-name { font-size: 16pt; font-weight: bold; text-transform: uppercase; margin: 0; }
        .autonomous { font-size: 13pt; font-weight: bold; margin: 2px 0; }
        .address { font-size: 11pt; margin-bottom: 5px; font-weight: bold; }
        .cia-title { font-size: 12pt; font-weight: bold; text-decoration: underline; margin: 8px 0; }
    </style>
</head>
<body>
    <div class="header-section">
        <p class="college-name">M.I.E.T. ENGINEERING COLLEGE</p>
        <p class="autonomous">(AUTONOMOUS)</p>
        <p class="address">Tiruchirappalli-620007</p>
        <p class="cia-title">Continuous Internal Assessment – ${ciaRoman}</p>
        <p style="font-weight: bold; margin: 0;">${paper.academicYear} ${semesterType}</p>
        <p style="font-weight: bold; margin: 0;">${paper.programme}</p>
        <p style="font-weight: bold; margin: 0;">${paper.semester}${paper.semester.toLowerCase().includes('semester') ? "" : " Semester"}</p>
        <p style="font-size: 12pt; font-weight: bold; margin: 10px 0; text-transform: uppercase;">${paper.courseCode} – ${paper.courseTitle}</p>
    </div>
    <p>Date: ${formattedDate}</p>
</body>
</html>
`;

fs.writeFileSync('c:/Users/ADMIN/Desktop/template/output.html', html);
console.log('Verification HTML rewritten in output.html');
