async function loadDashboard(){
    try {
        const status =
            await fetch("/learn/status")
            .then(r=>r.json());
        document.getElementById("profile").innerHTML = `
            <h3>${status.name ?? "Student"}</h3>
            <p>
                Grade:
                ${status.grade ?? "-"}
            </p>
            <p>
                Lessons completed:
                ${status.lessonHistoryCount}
            </p>
            <p>
                Tier:
                ${status.tier}
            </p>
            <p>
                Average mastery:
                ${
                    Math.round(
                        (status.masteryAnalytics.averageScore || 0)
                        *100
                    )
                }%
            </p>
        `;

        const next =
            await fetch("/learn/next")
            .then(r=>r.json());

        const lesson = next.lesson;

        document.getElementById("lesson").innerHTML = `
            <h3>
                ${lesson.chapter}
            </h3>
            <p>
                Subject:
                ${lesson.subject}
            </p>
            <p>
                Type:
                ${lesson.lessonType}
            </p>
            <p>
                Concepts:
                ${lesson.concepts.join(", ")}
            </p>
        `;

        document
        .getElementById("startLesson")
        .onclick = ()=>{
            location.href =
            "/learn/lesson.html";
        };

    }catch(err){
        document.body.innerHTML =
        `
        <h2>
        Failed loading EdVenture.
        </h2>
        <pre>${err}</pre>
        `;
    }
}
loadDashboard();