// url=https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH/ganada?node-id=7-15
// component=Logo

import figma from "figma"

export default {
  id: "logo",
  imports: ["import { Logo } from 'src/components';"],
  example: figma.code`<Logo withName={false}/>`,
}
