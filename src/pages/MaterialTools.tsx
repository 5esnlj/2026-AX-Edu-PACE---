import { NavLink } from "react-router-dom";
import "../translation-review.css";

export function MaterialTools() {
  return (
    <nav className="material-tools" aria-label="수업 자료 기능 선택">
      <NavLink to="/app/materials" end>
        자료 목록
      </NavLink>
      <NavLink to="/app/create">자료 재구성 (L1)</NavLink>
      <NavLink to="/app/materials/translation-review">오역 탐지 (L2)</NavLink>
    </nav>
  );
}
