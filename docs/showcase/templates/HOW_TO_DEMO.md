# Template demo: one template, three student reports

A guide (the project owner) sets a "Mini Project Report" template. Two students (editors) upload their
reports. DocStruct checks every report against the template, and the owner sees at a glance which ones are
still incomplete. One student then fixes their report and it turns green.

All accounts use the password `demo1234`. Everything happens in **DocStruct Mini Project**, where Vansh is
the owner and Vivan and Shrut are editors.

## Files in this folder

| File | Uploaded by | Template check |
|---|---|---|
| `Mini_Project_Report_TEMPLATE.txt` | (pasted by Vansh) | the 9 required sections |
| `Smart_Attendance_Report.md` | Vivan | **complete**; "Chapter 2 Introduction" still counts as *Introduction* |
| `Lost_and_Found_Report_v1.md` | Shrut | **2 missing**: Literature Review, Results |
| `Canteen_Feedback_Report.md` | Vivan | **1 missing**: References |
| `Lost_and_Found_Report_v2.md` | Shrut (new version) | **complete** after the fix |

## Steps (about 5 minutes)

### 1. The owner creates the template (Vansh)

1. Log in as **vansh@docstruct.test**, open **DocStruct Mini Project**, go to the **Templates** tab.
2. **New template**:
   - Name: `Mini Project Report`
   - Description: `Structure every mini project report must follow before it is submitted to the guide.`
   - Required sections: paste the 9 lines from `Mini_Project_Report_TEMPLATE.txt`
     (Abstract, Introduction, Problem Statement, Literature Review, Proposed System, Implementation,
     Results, Conclusion, References). The counter should read **9 sections**.
3. **Create**.

**Say:** "The guide's required report structure becomes a checklist the whole project uses."

### 2. Students upload their reports (Vivan, then Shrut)

1. Log in as **vivan@docstruct.test**, open **DocStruct Mini Project > Documents**, **Upload**
   `Smart_Attendance_Report.md`. On its page, under **Template check**, choose **Mini Project Report**:
   **All sections present**. Point at "Introduction, found as 'Chapter 2 Introduction'".
2. Still as Vivan, upload `Canteen_Feedback_Report.md` and choose the template: **1 missing: References**.
3. Log in as **shrut@docstruct.test**, upload `Lost_and_Found_Report_v1.md` and choose the template:
   **2 missing: Literature Review, Results**.
4. Still as Shrut, press **Send for review**: the dialog warns that two sections are missing. Cancel it.

**Say:** "Numbering, capitals and wording like 'Chapter 2' are ignored, so only real gaps are reported, and
the student sees them before the guide does."

### 3. The owner sees every submission at once (Vansh)

1. Log in as **vansh@docstruct.test**, open the **Templates** tab and click **Mini Project Report**.
2. The compliance list shows all three reports, incomplete ones first:
   - Lost and Found Portal: Missing: Literature Review, Results
   - Canteen Feedback Kiosk: Missing: References
   - Smart Attendance: Complete

**Say:** "With thirty groups submitting, the guide no longer opens every file to check the structure."

### 4. A student fixes the report (Shrut)

1. Log in as **shrut@docstruct.test**, open the Lost and Found report, **Upload new version** >
   `Lost_and_Found_Report_v2.md`, note "Added literature review and results".
2. The **Template check** turns green: **All sections present**. Optionally open **Compare** (v1 vs v2) to show
   the two added sections highlighted.
3. Back as Vansh, the compliance list now shows only the Canteen report as incomplete.

## Cleaning up after a rehearsal

As Vansh: delete the three uploaded documents (each document's **More > Delete**) and the template
(**Templates** tab, the bin icon), so the real demo starts clean.
