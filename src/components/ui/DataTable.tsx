import type { ReactElement, ReactNode } from 'react';
import styles from './ui.module.css';

export interface DataTableColumn<Row> {
  /** Unique column key. */
  key: string;
  /** Column header text (Vietnamese). */
  header: string;
  /** Render a cell for the given row. */
  render: (row: Row) => ReactNode;
}

export interface DataTableProps<Row> {
  columns: Array<DataTableColumn<Row>>;
  rows: Row[];
  /** Stable unique key accessor for each row. */
  getRowKey: (row: Row) => string;
  /** Accessible caption for the table. */
  caption: string;
}

export function DataTable<Row>({
  columns,
  rows,
  getRowKey,
  caption,
}: DataTableProps<Row>): ReactElement {
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <caption className="srOnly">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
