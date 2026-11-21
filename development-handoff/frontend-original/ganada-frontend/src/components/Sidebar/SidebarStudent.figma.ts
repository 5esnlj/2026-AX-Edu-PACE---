// url=https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH/ganada?node-id=23-432
// component=Sidebar

import figma from "figma"

export default {
  id: "sidebar-student",
  imports: ["import { Sidebar } from 'src/components';"],
  example: figma.code`<Sidebar role="student" className="3학년 2반" active="dashboard" onNavigate={() => { }}/>`,
}
