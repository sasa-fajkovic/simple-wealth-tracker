import { readonly, ref } from 'vue'

const referenceDataVersion = ref(0)
const dataPointsVersion = ref(0)

export function useDataRefresh() {
  return {
    referenceDataVersion: readonly(referenceDataVersion),
    dataPointsVersion: readonly(dataPointsVersion),
    notifyReferenceDataChanged: () => { referenceDataVersion.value++ },
    notifyDataPointsChanged: () => { dataPointsVersion.value++ },
  }
}
