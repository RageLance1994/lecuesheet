import type {
  HTMLAttributes,
  TableHTMLAttributes,
  ThHTMLAttributes,
  TdHTMLAttributes,
} from "react";

export function Table({ className = "", ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={`ui-table ${className}`.trim()} {...props} />;
}

export function TableHeader({ className = "", ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={`ui-table__head ${className}`.trim()} {...props} />;
}

export function TableBody({ className = "", ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={`ui-table__body ${className}`.trim()} {...props} />;
}

export function TableRow({ className = "", ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={`ui-table__row ${className}`.trim()} {...props} />;
}

export function TableHead({ className = "", ...props }: ThHTMLAttributes<HTMLTableHeaderCellElement>) {
  return <th className={`ui-table__th ${className}`.trim()} {...props} />;
}

export function TableCell({ className = "", ...props }: TdHTMLAttributes<HTMLTableDataCellElement>) {
  return <td className={`ui-table__td ${className}`.trim()} {...props} />;
}
