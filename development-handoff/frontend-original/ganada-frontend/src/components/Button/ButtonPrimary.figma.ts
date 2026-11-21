// url=https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH/ganada?node-id=1-100
// component=Button

import figma from "figma"

const label = figma.selectedInstance.getString("Label")

export default {
  id: "button-primary",
  imports: ["import { Button } from 'src/components';"],
  example: figma.code`<Button variant="primary">${figma.helpers.react.renderChildren(
    label,
  )}</Button>`,
  metadata: { nestable: true },
}
