import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export interface HandleProps {
  ref: (el: HTMLElement | null) => void
  attributes: DraggableAttributes
  listeners: DraggableSyntheticListeners
}

interface Props<T extends { id: string }> {
  items: T[]
  rowClass?: (item: T) => string
  renderRow: (item: T, handle: HandleProps) => React.ReactNode
  /** Called with the dragged item and the visible neighbours it was dropped between */
  onMove: (item: T, prev: T | undefined, next: T | undefined) => void
}

/** A vertical list whose rows can be reordered with a drag handle (mouse, touch or keyboard) */
export default function SortableRows<T extends { id: string }>({ items, rowClass, renderRow, onMove }: Props<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = items.findIndex((i) => i.id === active.id)
    const to = items.findIndex((i) => i.id === over.id)
    if (from < 0 || to < 0) return
    const rest = items.filter((i) => i.id !== active.id)
    // Moving down: land after the hovered row, moving up: before it
    const index = rest.findIndex((i) => i.id === over.id) + (to > from ? 1 : 0)
    onMove(items[from], rest[index - 1], rest[index])
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className="list">
          {items.map((item) => (
            <Row key={item.id} id={item.id} className={rowClass?.(item) ?? ''}>
              {(handle) => renderRow(item, handle)}
            </Row>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function Row({
  id,
  className,
  children,
}: {
  id: string
  className: string
  children: (handle: HandleProps) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <li
      ref={setNodeRef}
      className={className + (isDragging ? ' dragging' : '')}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {children({ ref: setActivatorNodeRef, attributes, listeners })}
    </li>
  )
}
